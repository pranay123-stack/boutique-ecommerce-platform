import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus, Prisma, ReturnResolution, ReturnStatus } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService, type StockLine } from '../inventory/inventory.service';
import { ZERO, round2 } from '../../common/utils/money';
import { paginate, skipOf } from '../../common/dto/pagination.dto';
import {
  MERCHANT_FAULT_REASONS,
  type CreateReturnDto,
  type InspectReturnDto,
  type AdminReturnQueryDto,
  type ReturnReason,
} from './dto/return.dto';

export interface ReturnIdentity {
  userId?: string;
  email?: string;
}

/**
 * Which status may follow which. A return that has been refunded cannot go
 * back to "requested", and stock cannot be restocked twice.
 */
export const RETURN_STATUS_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: [ReturnStatus.APPROVED, ReturnStatus.REJECTED, ReturnStatus.CANCELLED],
  APPROVED: [ReturnStatus.PICKUP_SCHEDULED, ReturnStatus.RECEIVED, ReturnStatus.CANCELLED],
  PICKUP_SCHEDULED: [ReturnStatus.IN_TRANSIT, ReturnStatus.RECEIVED, ReturnStatus.CANCELLED],
  IN_TRANSIT: [ReturnStatus.RECEIVED],
  RECEIVED: [ReturnStatus.INSPECTED],
  INSPECTED: [ReturnStatus.REFUNDED, ReturnStatus.REJECTED],
  REFUNDED: [],
  REJECTED: [],
  CANCELLED: [],
};

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);
  private readonly windowDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly events: EventEmitter2,
    config: ConfigService,
  ) {
    this.windowDays = config.get<number>('returns.windowDays') ?? 7;
  }

  // -------------------------------------------------------------- customer

  /**
   * Open a return request against a delivered order.
   *
   * The refund is *quoted* here, not paid: money only moves once the goods are
   * back and have passed inspection. Quoting it up front is what lets the
   * customer see what they will get before committing.
   */
  async request(identity: ReturnIdentity, dto: CreateReturnDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: true,
        returns: { include: { items: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertOwnership(order, identity, dto.guestEmail);

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        order.status === OrderStatus.SHIPPED
          ? 'This order is still on its way. You can return it once it has been delivered.'
          : 'Only delivered orders can be returned',
      );
    }

    const deliveredAt = await this.deliveredAt(order.id);
    const deadline = new Date(deliveredAt.getTime() + this.windowDays * 86_400_000);
    if (Date.now() > deadline.getTime()) {
      throw new BadRequestException(
        `The ${this.windowDays}-day return window for this order closed on ${deadline.toLocaleDateString('en-IN')}`,
      );
    }

    // How much of each line is still returnable, after earlier requests.
    const alreadyRequested = new Map<string, number>();
    for (const existing of order.returns) {
      if (existing.status === ReturnStatus.REJECTED || existing.status === ReturnStatus.CANCELLED) {
        continue;
      }
      for (const item of existing.items) {
        alreadyRequested.set(
          item.orderItemId,
          (alreadyRequested.get(item.orderItemId) ?? 0) + item.quantity,
        );
      }
    }

    const itemsById = new Map(order.items.map((i) => [i.id, i]));
    const priced = dto.items.map((requested) => {
      const orderItem = itemsById.get(requested.orderItemId);
      if (!orderItem) {
        throw new BadRequestException('One of those items is not part of this order');
      }
      const remaining = orderItem.quantity - (alreadyRequested.get(orderItem.id) ?? 0);
      if (requested.quantity > remaining) {
        throw new BadRequestException(
          remaining <= 0
            ? `${orderItem.productName} has already been returned`
            : `Only ${remaining} of ${orderItem.productName} can still be returned`,
        );
      }

      // Refund the amount actually charged for those units, GST included, so
      // the credit note reverses exactly what the invoice raised. Dividing the
      // line total by the ordered quantity keeps any discount apportioned.
      const perUnit = orderItem.lineTotal.div(orderItem.quantity);
      const refundAmount =
        requested.quantity === orderItem.quantity
          ? orderItem.lineTotal
          : round2(perUnit.mul(requested.quantity));

      return { orderItem, requested, refundAmount };
    });

    const refundTotal = round2(
      priced.reduce<Prisma.Decimal>((sum, p) => sum.add(p.refundAmount), ZERO()),
    );

    // Delivery is refunded only when the return is our fault.
    const ourFault = MERCHANT_FAULT_REASONS.includes(dto.reason as ReturnReason);
    const returnsEverything = priced.every(
      (p) => p.requested.quantity === p.orderItem.quantity && !alreadyRequested.has(p.orderItem.id),
    );
    const shippingRefund =
      ourFault && returnsEverything && order.returns.length === 0 ? order.shippingTotal : ZERO();

    const rmaNumber = await this.uniqueRmaNumber();

    try {
      const created = await this.prisma.returnRequest.create({
        data: {
          rmaNumber,
          orderId: order.id,
          userId: order.userId,
          guestEmail: order.userId ? null : order.guestEmail,
          reason: dto.reason,
          resolution: dto.resolution ?? ReturnResolution.REFUND,
          customerNote: dto.customerNote ?? null,
          refundAmount: round2(refundTotal.add(shippingRefund)),
          items: {
            create: priced.map((p) => ({
              orderItemId: p.orderItem.id,
              quantity: p.requested.quantity,
              reason: p.requested.reason ?? null,
              refundAmount: p.refundAmount,
            })),
          },
        },
        include: { items: true },
      });

      this.events.emit('return.requested', {
        returnId: created.id,
        rmaNumber,
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        email: order.guestEmail,
        refundAmount: created.refundAmount.toFixed(2),
      });

      this.logger.log(`Return ${rmaNumber} opened on order ${order.orderNumber}`);
      return created;
    } catch (err) {
      // The partial unique index permits only one open return per order, so a
      // double-submit lands here rather than creating a second payout.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String(err.meta?.target ?? '').includes('one_open_per_order')
      ) {
        throw new BadRequestException('There is already an open return on this order');
      }
      throw err;
    }
  }

  async findMine(identity: ReturnIdentity, page: { page: number; limit: number }) {
    const where: Prisma.ReturnRequestWhereInput = identity.userId
      ? { userId: identity.userId }
      : { guestEmail: identity.email ?? '__none__' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.returnRequest.findMany({
        where,
        include: {
          items: { include: { orderItem: true } },
          order: { select: { orderNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: skipOf(page),
        take: page.limit,
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return paginate(items, total, page.page, page.limit);
  }

  async findOne(id: string, identity: ReturnIdentity) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: {
        items: { include: { orderItem: true } },
        order: { select: { orderNumber: true, userId: true, guestEmail: true } },
      },
    });
    if (!request) throw new NotFoundException('Return request not found');
    this.assertOwnership(request.order, identity, identity.email);
    return request;
  }

  async cancel(id: string, identity: ReturnIdentity) {
    const request = await this.findOne(id, identity);
    if (!RETURN_STATUS_TRANSITIONS[request.status].includes(ReturnStatus.CANCELLED)) {
      throw new BadRequestException(
        `A return that is already ${request.status.toLowerCase().replace(/_/g, ' ')} cannot be cancelled`,
      );
    }
    return this.prisma.returnRequest.update({
      where: { id },
      data: { status: ReturnStatus.CANCELLED, resolvedAt: new Date() },
    });
  }

  /** What can still be sent back, so the UI never offers an impossible return. */
  async eligibility(orderId: string, identity: ReturnIdentity) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, returns: { include: { items: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertOwnership(order, identity, identity.email);

    const returned = new Map<string, number>();
    for (const existing of order.returns) {
      if (existing.status === ReturnStatus.REJECTED || existing.status === ReturnStatus.CANCELLED) {
        continue;
      }
      for (const item of existing.items) {
        returned.set(item.orderItemId, (returned.get(item.orderItemId) ?? 0) + item.quantity);
      }
    }

    let closesAt: Date | null = null;
    let withinWindow = false;
    if (order.status === OrderStatus.DELIVERED) {
      const deliveredAt = await this.deliveredAt(order.id);
      closesAt = new Date(deliveredAt.getTime() + this.windowDays * 86_400_000);
      withinWindow = Date.now() <= closesAt.getTime();
    }

    const items = order.items.map((item) => ({
      orderItemId: item.id,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      returnedQuantity: returned.get(item.id) ?? 0,
      returnableQuantity: Math.max(0, item.quantity - (returned.get(item.id) ?? 0)),
      refundPerUnit: round2(item.lineTotal.div(item.quantity)),
    }));

    const hasOpen = order.returns.some(
      (r) =>
        r.status !== ReturnStatus.REJECTED &&
        r.status !== ReturnStatus.CANCELLED &&
        r.status !== ReturnStatus.REFUNDED,
    );

    return {
      eligible:
        order.status === OrderStatus.DELIVERED &&
        withinWindow &&
        !hasOpen &&
        items.some((i) => i.returnableQuantity > 0),
      reason: this.ineligibilityReason(order.status, withinWindow, hasOpen, items),
      windowDays: this.windowDays,
      closesAt,
      items,
    };
  }

  private ineligibilityReason(
    status: OrderStatus,
    withinWindow: boolean,
    hasOpen: boolean,
    items: Array<{ returnableQuantity: number }>,
  ): string | null {
    if (status !== OrderStatus.DELIVERED) return 'Only delivered orders can be returned';
    if (hasOpen) return 'There is already an open return on this order';
    if (!withinWindow) return `The ${this.windowDays}-day return window has closed`;
    if (!items.some((i) => i.returnableQuantity > 0)) return 'Everything has already been returned';
    return null;
  }

  // ----------------------------------------------------------------- admin

  async findAll(query: AdminReturnQueryDto) {
    const where: Prisma.ReturnRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { rmaNumber: { contains: query.search, mode: 'insensitive' as const } },
              { order: { orderNumber: { contains: query.search, mode: 'insensitive' as const } } },
              { guestEmail: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.returnRequest.findMany({
        where,
        include: {
          items: { include: { orderItem: true } },
          order: { select: { orderNumber: true, grandTotal: true } },
          user: { select: { email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async updateStatus(id: string, status: ReturnStatus, staffNote?: string) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!request) throw new NotFoundException('Return request not found');

    const allowed = RETURN_STATUS_TRANSITIONS[request.status];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot move a return from ${request.status} to ${status}. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const updated = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status,
        ...(staffNote ? { staffNote } : {}),
        ...(status === ReturnStatus.RECEIVED ? { receivedAt: new Date() } : {}),
        ...(status === ReturnStatus.PICKUP_SCHEDULED ? { pickupScheduledAt: new Date() } : {}),
        ...(status === ReturnStatus.REJECTED || status === ReturnStatus.REFUNDED
          ? { resolvedAt: new Date() }
          : {}),
      },
    });

    this.events.emit('return.status_changed', {
      returnId: id,
      rmaNumber: request.rmaNumber,
      status,
      userId: request.userId,
      email: request.guestEmail,
    });
    return updated;
  }

  /**
   * Record the inspection outcome and put saleable stock back on sale.
   *
   * Restocking happens here rather than on receipt because an item that comes
   * back damaged must not be sold again - and until someone has looked at it,
   * nobody knows which it is.
   */
  async inspect(id: string, dto: InspectReturnDto) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { items: { include: { orderItem: true } } },
    });
    if (!request) throw new NotFoundException('Return request not found');
    if (request.status !== ReturnStatus.RECEIVED) {
      throw new BadRequestException('Only a received return can be inspected');
    }

    const byId = new Map(request.items.map((i) => [i.id, i]));
    for (const outcome of dto.items) {
      if (!byId.has(outcome.returnItemId)) {
        throw new BadRequestException('One of those items is not part of this return');
      }
    }
    if (dto.items.length !== request.items.length) {
      throw new BadRequestException('Every item in the return must be inspected');
    }

    const restock: StockLine[] = [];
    let refundable = ZERO();

    for (const outcome of dto.items) {
      const item = byId.get(outcome.returnItemId)!;
      if (outcome.restockable) {
        refundable = refundable.add(item.refundAmount);
        if (item.orderItem.variantId) {
          restock.push({ variantId: item.orderItem.variantId, quantity: item.quantity });
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const outcome of dto.items) {
        await tx.returnItem.update({
          where: { id: outcome.returnItemId },
          data: {
            restockable: outcome.restockable,
            ...(outcome.note ? { reason: outcome.note } : {}),
            // An item that failed inspection is going back to the customer, so
            // it refunds nothing.
            ...(outcome.restockable ? {} : { refundAmount: ZERO() }),
          },
        });
      }

      if (restock.length) {
        await this.inventory.returnStock(restock, { type: 'RETURN', id: request.rmaNumber }, tx);
      }

      await tx.returnRequest.update({
        where: { id },
        data: {
          status: ReturnStatus.INSPECTED,
          inspectedAt: new Date(),
          refundAmount: round2(refundable),
          ...(dto.staffNote ? { staffNote: dto.staffNote } : {}),
        },
      });
    });

    this.logger.log(
      `Return ${request.rmaNumber} inspected: ${restock.length}/${request.items.length} line(s) restocked, ${refundable.toFixed(2)} refundable`,
    );

    this.events.emit('return.inspected', {
      returnId: id,
      rmaNumber: request.rmaNumber,
      refundAmount: round2(refundable).toFixed(2),
      userId: request.userId,
      email: request.guestEmail,
    });

    return this.prisma.returnRequest.findUnique({
      where: { id },
      include: { items: { include: { orderItem: true } } },
    });
  }

  /** Link the refund that settled this return. */
  async attachRefund(id: string, refundId: string) {
    return this.prisma.returnRequest.update({
      where: { id },
      data: { refundId, status: ReturnStatus.REFUNDED, resolvedAt: new Date() },
    });
  }

  // ----------------------------------------------------------------- utils

  private async deliveredAt(orderId: string): Promise<Date> {
    const event = await this.prisma.orderStatusHistory.findFirst({
      where: { orderId, toStatus: OrderStatus.DELIVERED },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    // Falling back to now would open an unbounded window, so an order marked
    // delivered without a history row is treated as delivered at order time.
    if (event) return event.createdAt;
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { placedAt: true },
    });
    return order.placedAt;
  }

  private async uniqueRmaNumber(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      let suffix = '';
      for (let i = 0; i < 5; i += 1) suffix += alphabet[randomInt(alphabet.length)];
      const candidate = `RMA-${stamp}-${suffix}`;
      const clash = await this.prisma.returnRequest.findUnique({
        where: { rmaNumber: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    throw new Error('Could not allocate a unique RMA number');
  }

  private assertOwnership(
    order: { userId: string | null; guestEmail: string | null },
    identity: ReturnIdentity,
    email?: string,
  ): void {
    if (identity.userId && order.userId === identity.userId) return;
    const claimed = (email ?? identity.email ?? '').trim().toLowerCase();
    if (!order.userId && claimed && order.guestEmail === claimed) return;
    throw new ForbiddenException('You do not have access to this order');
  }
}
