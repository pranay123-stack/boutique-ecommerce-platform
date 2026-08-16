import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SHIPPING_PROVIDER,
  type IShippingProvider,
  type ShippingAddress,
} from './providers/shipping-provider.interface';
import type { RateQuoteDto, ValidateAddressDto } from './dto/shipping.dto';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Inject(SHIPPING_PROVIDER) private readonly provider: IShippingProvider,
  ) {}

  async validateAddress(dto: ValidateAddressDto) {
    return this.provider.validateAddress({
      ...dto.address,
      country: dto.address.country ?? 'IN',
    } as ShippingAddress);
  }

  async getRates(dto: RateQuoteDto) {
    const rates = await this.provider.getRates({
      destinationPostalCode: dto.postalCode,
      weightGrams: dto.weightGrams ?? 500,
      declaredValue: dto.declaredValue ?? 0,
      cod: dto.cod ?? false,
    });
    return { provider: this.provider.name, rates };
  }

  /**
   * Book a shipment for a paid order and advance it to SHIPPED.
   *
   * Guarded so an order cannot be double-booked: a retry returns the existing
   * shipment rather than creating a second consignment for the same goods.
   */
  async createShipment(orderId: string, courierId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        shipments: true,
        user: { select: { email: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const active = order.shipments.find((s) => s.status !== ShipmentStatus.CANCELLED);
    if (active) return active;

    if (order.paymentStatus !== 'CAPTURED') {
      throw new BadRequestException('Cannot ship an order that has not been paid');
    }
    if ([OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(order.status as never)) {
      throw new BadRequestException(`Cannot ship a ${order.status.toLowerCase()} order`);
    }

    const address = order.shippingAddress as unknown as ShippingAddress;
    const weightGrams = await this.estimateWeight(order.items);

    const result = await this.provider.createShipment({
      orderNumber: order.orderNumber,
      orderId: order.id,
      customerEmail: order.user?.email ?? order.guestEmail ?? 'unknown@boutique.local',
      shippingAddress: address,
      items: order.items.map((i) => ({
        sku: i.sku,
        name: i.productName,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
      })),
      subtotal: Number(order.subtotal),
      weightGrams,
      courierId,
    });

    const shipment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          orderId: order.id,
          provider: this.provider.name,
          providerShipmentId: result.providerShipmentId,
          providerOrderId: result.providerOrderId,
          awbCode: result.awbCode,
          courierName: result.courierName,
          status: result.awbCode ? ShipmentStatus.CREATED : ShipmentStatus.PENDING,
          trackingUrl: result.awbCode ? this.trackingUrl(result.awbCode) : null,
          labelUrl: result.labelUrl,
          manifestUrl: result.manifestUrl,
          shippingCharge:
            result.shippingCharge !== null ? new Prisma.Decimal(result.shippingCharge) : null,
          weightGrams,
          estimatedDelivery: result.estimatedDelivery,
          shippedAt: new Date(),
          rawPayload: result.raw as Prisma.InputJsonValue,
        },
      });

      // Only advance the order if the state machine allows it.
      if (
        [OrderStatus.PACKED, OrderStatus.PROCESSING, OrderStatus.PAYMENT_CONFIRMED].includes(
          order.status as never,
        )
      ) {
        await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.SHIPPED } });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: OrderStatus.SHIPPED,
            note: `Shipment booked${result.awbCode ? ` (AWB ${result.awbCode})` : ''}`,
          },
        });
      }
      return created;
    });

    this.events.emit('shipment.created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      email: order.guestEmail ?? order.user?.email,
      awbCode: result.awbCode,
      courierName: result.courierName,
      trackingUrl: shipment.trackingUrl,
    });

    return shipment;
  }

  /** Pull the latest carrier scan and mirror it into our own tracking timeline. */
  async syncTracking(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: true, trackingEvents: true },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (!shipment.awbCode) throw new BadRequestException('Shipment has no tracking number yet');

    const tracking = await this.provider.track(shipment.awbCode);
    const known = new Set(
      shipment.trackingEvents.map((e) => `${e.status}:${e.occurredAt.toISOString()}`),
    );
    const fresh = tracking.events.filter(
      (e) => !known.has(`${e.status}:${e.occurredAt.toISOString()}`),
    );

    const status = tracking.status as ShipmentStatus;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (fresh.length) {
        await tx.shipmentTrackingEvent.createMany({
          data: fresh.map((e) => ({
            shipmentId: shipment.id,
            status: e.status,
            description: e.description,
            location: e.location,
            occurredAt: e.occurredAt,
          })),
        });
      }

      const result = await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status,
          courierName: tracking.courierName ?? shipment.courierName,
          estimatedDelivery: tracking.estimatedDelivery ?? shipment.estimatedDelivery,
          deliveredAt: tracking.deliveredAt ?? shipment.deliveredAt,
        },
      });

      // Delivery is the one carrier state that drives the order forward.
      if (status === ShipmentStatus.DELIVERED && shipment.order.status === OrderStatus.SHIPPED) {
        await tx.order.update({
          where: { id: shipment.orderId },
          data: { status: OrderStatus.DELIVERED },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: shipment.orderId,
            fromStatus: OrderStatus.SHIPPED,
            toStatus: OrderStatus.DELIVERED,
            note: 'Carrier confirmed delivery',
          },
        });
      }
      return result;
    });

    if (status === ShipmentStatus.DELIVERED && shipment.status !== ShipmentStatus.DELIVERED) {
      this.events.emit('shipment.delivered', {
        orderId: shipment.orderId,
        orderNumber: shipment.order.orderNumber,
        userId: shipment.order.userId,
        email: shipment.order.guestEmail,
      });
    }

    return { ...updated, newEvents: fresh.length };
  }

  /** Batch refresh for the scheduled worker. */
  async syncAllActive(): Promise<{ synced: number; failed: number }> {
    const active = await this.prisma.shipment.findMany({
      where: {
        status: {
          in: [
            ShipmentStatus.CREATED,
            ShipmentStatus.PICKUP_SCHEDULED,
            ShipmentStatus.IN_TRANSIT,
            ShipmentStatus.OUT_FOR_DELIVERY,
          ],
        },
        awbCode: { not: null },
      },
      take: 200,
      select: { id: true },
    });

    let synced = 0;
    let failed = 0;
    for (const s of active) {
      try {
        await this.syncTracking(s.id);
        synced += 1;
      } catch (err) {
        failed += 1;
        this.logger.error(`Tracking sync failed for shipment ${s.id}: ${(err as Error).message}`);
      }
    }
    return { synced, failed };
  }

  async findByOrder(orderId: string) {
    return this.prisma.shipment.findMany({
      where: { orderId },
      include: { trackingEvents: { orderBy: { occurredAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelShipment(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.status === ShipmentStatus.DELIVERED) {
      throw new BadRequestException('A delivered shipment cannot be cancelled');
    }
    if (shipment.providerShipmentId) {
      await this.provider.cancelShipment(shipment.providerShipmentId);
    }
    return this.prisma.shipment.update({
      where: { id: shipmentId },
      data: { status: ShipmentStatus.CANCELLED },
    });
  }

  private trackingUrl(awbCode: string): string {
    return `https://shiprocket.co/tracking/${awbCode}`;
  }

  private async estimateWeight(
    items: Array<{ variantId: string | null; quantity: number }>,
  ): Promise<number> {
    const variantIds = items.map((i) => i.variantId).filter((id): id is string => Boolean(id));
    if (!variantIds.length) return 500;

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, weightGrams: true },
    });
    const byId = new Map(variants.map((v) => [v.id, v.weightGrams]));
    const total = items.reduce(
      (sum, i) => sum + (byId.get(i.variantId ?? '') ?? 250) * i.quantity,
      0,
    );
    // Never book a zero-weight consignment; carriers reject it.
    return Math.max(100, total);
  }
}
