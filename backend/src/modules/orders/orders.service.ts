import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus, PaymentProvider, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingService, type PricingInputLine } from '../pricing/pricing.service';
import { InventoryService, type StockLine } from '../inventory/inventory.service';
import { CouponsService } from '../coupons/coupons.service';
import { generateOrderNumber } from '../../common/utils/order-number';
import { ORDER_STATUS_TRANSITIONS } from '../../common/constants';
import { paginate, skipOf, type PageParams } from '../../common/dto/pagination.dto';
import type { CreateOrderDto } from './dto/order.dto';

export interface OrderIdentity {
  userId?: string;
  sessionId?: string;
  email?: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
    private readonly coupons: CouponsService,
    private readonly events: EventEmitter2,
  ) {}

  // ------------------------------------------------------------- creation

  /**
   * Turn the active cart into an order.
   *
   * Everything below happens in one transaction: price, reserve stock, write
   * the order, redeem the coupon and convert the cart. If any step fails the
   * whole thing rolls back, so we can never end up with reserved stock and no
   * order, or an order with no stock behind it.
   */
  async create(identity: OrderIdentity, dto: CreateOrderDto) {
    if (!identity.userId && !dto.guestEmail) {
      throw new BadRequestException('An email address is required for guest checkout');
    }

    const cart = await this.prisma.cart.findFirst({
      where: {
        ...(identity.userId ? { userId: identity.userId } : { sessionId: identity.sessionId }),
        status: 'ACTIVE',
      },
      include: {
        items: {
          include: {
            variant: {
              include: {
                inventory: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    categoryId: true,
                    taxRatePercent: true,
                    hsnCode: true,
                    status: true,
                    deletedAt: true,
                  },
                },
                images: { take: 1, orderBy: { position: 'asc' } },
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    const unavailable = cart.items.filter(
      (i) => !i.variant.isActive || i.variant.deletedAt || i.variant.product.status !== 'ACTIVE',
    );
    if (unavailable.length) {
      throw new BadRequestException(
        `These items are no longer available: ${unavailable.map((i) => i.variant.sku).join(', ')}`,
      );
    }

    const inputLines: PricingInputLine[] = cart.items.map((item) => ({
      variantId: item.variantId,
      productId: item.variant.product.id,
      categoryId: item.variant.product.categoryId,
      sku: item.variant.sku,
      productName: item.variant.product.name,
      variantName: item.variant.name,
      imageUrl: item.variant.images[0]?.url ?? null,
      unitPrice: item.variant.discountPrice ?? item.variant.price,
      quantity: item.quantity,
      taxRatePercent: item.variant.product.taxRatePercent,
      weightGrams: item.variant.weightGrams,
      hsnCode: item.variant.product.hsnCode,
    }));

    const paymentMethod = dto.paymentMethod ?? 'PREPAID';

    // The delivery state decides CGST+SGST vs IGST, so it has to be settled
    // here - at cart preview there is no address yet.
    const priced = await this.pricing.price(inputLines, {
      couponCode: cart.couponCode,
      userId: identity.userId ?? null,
      deliveryState: dto.shippingAddress.state,
      paymentMethod,
    });

    if (cart.couponCode && priced.couponError) {
      throw new BadRequestException(`Coupon ${cart.couponCode}: ${priced.couponError}`);
    }

    const stockLines: StockLine[] = inputLines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
    }));

    const orderNumber = await this.uniqueOrderNumber();
    const billing = dto.billingAddress ?? dto.shippingAddress;

    const order = await this.prisma.$transaction(
      async (tx) => {
        // Conditional UPDATEs inside the transaction - this is what actually
        // prevents overselling under concurrent checkouts.
        await this.inventory.reserve(stockLines, { type: 'ORDER', id: orderNumber }, tx);

        const created = await tx.order.create({
          data: {
            orderNumber,
            userId: identity.userId ?? null,
            guestEmail: identity.userId ? null : (dto.guestEmail ?? null),
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.PENDING,
            subtotal: priced.subtotal,
            discountTotal: priced.discountTotal,
            shippingTotal: priced.shippingTotal,
            taxTotal: priced.taxTotal,
            grandTotal: priced.grandTotal,
            // GST snapshot. Rates and the seller's registration can change;
            // an invoice already issued must never restate itself.
            taxableTotal: priced.taxableTotal,
            cgstTotal: priced.cgstTotal,
            sgstTotal: priced.sgstTotal,
            igstTotal: priced.igstTotal,
            isInterState: priced.isInterState,
            placeOfSupply: priced.placeOfSupply,
            placeOfSupplyCode: priced.placeOfSupplyCode,
            sellerGstin: priced.sellerGstin || null,
            codCharge: priced.codCharge,
            couponId: priced.coupon?.couponId ?? null,
            couponCode: priced.coupon?.code ?? null,
            // Addresses are snapshotted as JSON: editing a saved address later
            // must never rewrite the record of where an order was sent.
            shippingAddress: {
              ...dto.shippingAddress,
              country: dto.shippingAddress.country ?? 'IN',
            } as unknown as Prisma.InputJsonValue,
            billingAddress: {
              ...billing,
              country: billing.country ?? 'IN',
            } as unknown as Prisma.InputJsonValue,
            customerNote: dto.customerNote ?? null,
            items: {
              create: priced.lines.map((line) => ({
                productId: line.productId,
                variantId: line.variantId,
                sku: line.sku,
                productName: line.productName,
                variantName: line.variantName,
                imageUrl: line.imageUrl,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                discountAmount: line.discountAmount,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
                hsnCode: line.hsnCode,
                gstRate: line.gstRate,
                taxableValue: line.taxableValue,
                cgstRate: line.cgstRate,
                cgstAmount: line.cgstAmount,
                sgstRate: line.sgstRate,
                sgstAmount: line.sgstAmount,
                igstRate: line.igstRate,
                igstAmount: line.igstAmount,
              })),
            },
            statusHistory: {
              create: {
                toStatus: OrderStatus.PENDING,
                note: paymentMethod === 'COD' ? 'Order placed (cash on delivery)' : 'Order placed',
              },
            },
            // COD still gets a payment row so refunds, reconciliation and the
            // admin views have one shape to work with regardless of method.
            ...(paymentMethod === 'COD'
              ? {
                  payments: {
                    create: {
                      provider: PaymentProvider.COD,
                      status: PaymentStatus.PENDING,
                      amount: priced.grandTotal,
                      currency: 'INR',
                      method: 'cod',
                    },
                  },
                }
              : {}),
          },
          include: { items: true },
        });

        if (priced.coupon) {
          await this.coupons.redeem(
            tx,
            priced.coupon.couponId,
            created.id,
            identity.userId ?? null,
            priced.discountTotal,
          );
        }

        await tx.cart.update({
          where: { id: cart.id },
          data: { status: 'CONVERTED', couponCode: null },
        });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

        if (dto.saveAddress && identity.userId) {
          await tx.address.create({
            data: {
              userId: identity.userId,
              ...dto.shippingAddress,
              country: dto.shippingAddress.country ?? 'IN',
            },
          });
        }

        return created;
      },
      { timeout: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    this.events.emit('order.created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: identity.userId,
      email: identity.userId ? undefined : dto.guestEmail,
      grandTotal: order.grandTotal.toFixed(2),
      paymentMethod,
    });

    // There is no gateway to wait for on COD, so the order is confirmed for
    // fulfilment straight away. The money is collected by the courier, which
    // is why paymentStatus stays PENDING until delivery.
    if (paymentMethod === 'COD') {
      await this.confirmForFulfilment(order.id, {
        paymentStatus: PaymentStatus.PENDING,
        note: 'Confirmed for dispatch - payment due on delivery',
        event: 'order.confirmed.cod',
      });
    }

    this.logger.log(
      `Order ${orderNumber} created (${order.grandTotal.toFixed(2)}, ${paymentMethod})`,
    );
    return this.findOne(order.id, identity);
  }

  // ------------------------------------------------------- payment outcome

  /**
   * Promote an order once payment is confirmed server-side. Idempotent: a
   * webhook and a client callback can both land and only the first mutates.
   */
  async markPaid(orderId: string, note = 'Payment confirmed'): Promise<void> {
    await this.confirmForFulfilment(orderId, {
      paymentStatus: PaymentStatus.CAPTURED,
      note,
      event: 'order.paid',
    });
  }

  /**
   * Move a PENDING order into fulfilment: turn the stock reservation into a
   * real decrement and record the transition.
   *
   * Shared by prepaid confirmation and COD, which differ only in whether the
   * money has arrived yet. Idempotent, because a webhook and a client callback
   * can both land and only the first may mutate.
   */
  private async confirmForFulfilment(
    orderId: string,
    opts: { paymentStatus: PaymentStatus; note: string; event: string },
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== OrderStatus.PENDING) {
      this.logger.debug(
        `Order ${order.orderNumber} already settled; ignoring duplicate confirmation`,
      );
      return;
    }

    const stockLines: StockLine[] = order.items
      .filter((i) => i.variantId)
      .map((i) => ({ variantId: i.variantId as string, quantity: i.quantity }));

    await this.prisma.$transaction(async (tx) => {
      // Reservation becomes a real decrement now that the order is committed.
      await this.inventory.commit(stockLines, { type: 'ORDER', id: order.orderNumber }, tx);

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAYMENT_CONFIRMED, paymentStatus: opts.paymentStatus },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.PAYMENT_CONFIRMED,
          note: opts.note,
        },
      });

      for (const item of order.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { totalSold: { increment: item.quantity } },
          });
        }
      }
    });

    this.events.emit(opts.event, {
      orderId,
      orderNumber: order.orderNumber,
      userId: order.userId,
      email: order.guestEmail,
      grandTotal: order.grandTotal.toFixed(2),
    });
  }

  /**
   * Record cash collected by the courier. Called when a COD order is marked
   * delivered - until then the business is owed the money, and the books have
   * to say so.
   */
  async markCodCollected(orderId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    const payment = await client.payment.findFirst({
      where: { orderId, provider: PaymentProvider.COD, status: PaymentStatus.PENDING },
    });
    if (!payment) return;

    await client.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.CAPTURED, capturedAt: new Date() },
    });
    await client.order.update({
      where: { id: orderId },
      data: { paymentStatus: PaymentStatus.CAPTURED },
    });
    this.logger.log(`COD collected for order ${orderId} (${payment.amount.toFixed(2)})`);
  }

  /** Payment failed - free the reserved stock so other shoppers can buy it. */
  async markPaymentFailed(orderId: string, reason: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.paymentStatus === PaymentStatus.CAPTURED) return;

    const stockLines: StockLine[] = order.items
      .filter((i) => i.variantId)
      .map((i) => ({ variantId: i.variantId as string, quantity: i.quantity }));

    await this.prisma.$transaction(async (tx) => {
      await this.inventory.release(stockLines, { type: 'ORDER', id: order.orderNumber }, tx);
      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: order.status,
          note: `Payment failed: ${reason}`,
        },
      });
    });

    this.events.emit('order.payment_failed', {
      orderId,
      orderNumber: order.orderNumber,
      userId: order.userId,
      email: order.guestEmail,
      reason,
    });
  }

  // ---------------------------------------------------------------- reads

  async findAllForCustomer(identity: OrderIdentity, query: PageParams) {
    const where: Prisma.OrderWhereInput = identity.userId
      ? { userId: identity.userId }
      : { guestEmail: identity.email };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
        include: {
          items: {
            select: {
              id: true,
              productName: true,
              variantName: true,
              imageUrl: true,
              quantity: true,
              lineTotal: true,
            },
          },
          shipments: {
            select: { status: true, awbCode: true, courierName: true, trackingUrl: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(orderId: string, identity: OrderIdentity) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payments: {
          select: {
            id: true,
            provider: true,
            status: true,
            amount: true,
            method: true,
            createdAt: true,
            capturedAt: true,
          },
        },
        refunds: {
          select: {
            id: true,
            amount: true,
            status: true,
            reason: true,
            createdAt: true,
            processedAt: true,
          },
        },
        shipments: { include: { trackingEvents: { orderBy: { occurredAt: 'desc' } } } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertOwnership(order, identity);
    return order;
  }

  async findByNumber(orderNumber: string, identity: OrderIdentity) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.findOne(order.id, identity);
  }

  /** Ownership check that works for members and guests alike. */
  private assertOwnership(
    order: { userId: string | null; guestEmail: string | null },
    identity: OrderIdentity,
  ): void {
    if (identity.userId && order.userId === identity.userId) return;
    if (!order.userId && identity.email && order.guestEmail === identity.email) return;
    throw new ForbiddenException('You do not have access to this order');
  }

  async cancel(orderId: string, identity: OrderIdentity, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertOwnership(order, identity);

    if (!ORDER_STATUS_TRANSITIONS[order.status]?.includes(OrderStatus.CANCELLED)) {
      throw new BadRequestException(
        `An order that is already ${order.status.toLowerCase().replace('_', ' ')} cannot be cancelled`,
      );
    }

    const stockLines: StockLine[] = order.items
      .filter((i) => i.variantId)
      .map((i) => ({ variantId: i.variantId as string, quantity: i.quantity }));

    await this.prisma.$transaction(async (tx) => {
      // Confirmed orders already consumed stock; only a PENDING order still
      // merely holds a reservation. Keying this off paymentStatus would be
      // wrong for COD, which is confirmed for dispatch while still unpaid.
      const stillReserved = order.status === OrderStatus.PENDING;
      await (stillReserved
        ? this.inventory.release(stockLines, { type: 'ORDER_CANCEL', id: order.orderNumber }, tx)
        : this.inventory.returnStock(
            stockLines,
            { type: 'ORDER_CANCEL', id: order.orderNumber },
            tx,
          ));

      await tx.payment.updateMany({
        where: { orderId, provider: PaymentProvider.COD, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED, errorDescription: 'Cancelled by customer' },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: reason ?? 'Cancelled by customer',
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.CANCELLED,
          note: reason ?? 'Cancelled by customer',
        },
      });
    });

    this.events.emit('order.cancelled', {
      orderId,
      orderNumber: order.orderNumber,
      userId: order.userId,
      email: order.guestEmail,
      requiresRefund: order.paymentStatus === PaymentStatus.CAPTURED,
    });

    return this.findOne(orderId, identity);
  }

  private async uniqueOrderNumber(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateOrderNumber();
      const clash = await this.prisma.order.findUnique({
        where: { orderNumber: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    throw new Error('Could not allocate a unique order number');
  }
}
