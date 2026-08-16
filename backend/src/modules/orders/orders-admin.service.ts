import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderStatus, PaymentProvider, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryService, type StockLine } from '../inventory/inventory.service';
import { OrdersService } from './orders.service';
import { ORDER_STATUS_TRANSITIONS } from '../../common/constants';
import { paginate, skipOf, type PageParams } from '../../common/dto/pagination.dto';

export interface AdminOrderQuery extends PageParams {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  search?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class OrdersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly orders: OrdersService,
    private readonly events: EventEmitter2,
  ) {}

  async findAll(query: AdminOrderQuery) {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              { guestEmail: { contains: query.search, mode: 'insensitive' } },
              { user: { email: { contains: query.search, mode: 'insensitive' } } },
              { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          items: { select: { id: true, quantity: true, productName: true } },
          shipments: { select: { status: true, awbCode: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
        items: true,
        payments: true,
        refunds: true,
        shipments: { include: { trackingEvents: { orderBy: { occurredAt: 'desc' } } } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        coupon: { select: { code: true, type: true, value: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * Move an order along its lifecycle.
   *
   * Transitions are validated against an explicit state machine rather than
   * allowing arbitrary status writes - that is what stops a delivered order
   * being flipped back to pending, or stock being released twice.
   */
  async updateStatus(
    id: string,
    status: OrderStatus,
    note: string | undefined,
    actorUserId: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status === status) {
      throw new BadRequestException(`Order is already ${status}`);
    }

    const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot move an order from ${order.status} to ${status}. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const stockLines: StockLine[] = order.items
      .filter((i) => i.variantId)
      .map((i) => ({ variantId: i.variantId as string, quantity: i.quantity }));

    await this.prisma.$transaction(async (tx) => {
      if (status === OrderStatus.CANCELLED) {
        // Which unwind applies depends on whether the stock was ever
        // committed, not on whether the money arrived. A COD order is
        // committed at confirmation while its payment is still PENDING, so
        // keying off paymentStatus here would release a reservation that no
        // longer exists and quietly corrupt the counts. PENDING is the only
        // status where stock is still merely reserved.
        const stillReserved = order.status === OrderStatus.PENDING;
        await (stillReserved
          ? this.inventory.release(stockLines, { type: 'ADMIN_CANCEL', id: order.orderNumber }, tx)
          : this.inventory.returnStock(
              stockLines,
              { type: 'ADMIN_CANCEL', id: order.orderNumber },
              tx,
            ));

        // Cash that will never be collected must not sit on the books.
        await tx.payment.updateMany({
          where: { orderId: id, provider: PaymentProvider.COD, status: PaymentStatus.PENDING },
          data: {
            status: PaymentStatus.FAILED,
            errorDescription: 'Order cancelled before delivery',
          },
        });
      }
      if (status === OrderStatus.RETURNED) {
        await this.inventory.returnStock(stockLines, { type: 'RETURN', id: order.orderNumber }, tx);
      }

      // The courier hands the cash over on delivery, so that is the moment a
      // COD order actually becomes paid.
      if (status === OrderStatus.DELIVERED) {
        await this.orders.markCodCollected(id, tx);
      }

      await tx.order.update({
        where: { id },
        data: {
          status,
          ...(status === OrderStatus.CANCELLED
            ? { cancelledAt: new Date(), cancelReason: note ?? 'Cancelled by staff' }
            : {}),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: status,
          note: note ?? null,
          changedByUserId: actorUserId,
        },
      });
    });

    this.events.emit('order.status_changed', {
      orderId: id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      email: order.guestEmail,
      fromStatus: order.status,
      toStatus: status,
    });

    return this.findOne(id);
  }

  async addInternalNote(id: string, note: string) {
    await this.prisma.order.update({ where: { id }, data: { internalNote: note } });
    return this.findOne(id);
  }
}
