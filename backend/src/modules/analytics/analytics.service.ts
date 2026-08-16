import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_TTL } from '../../common/constants';

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Business reporting.
 *
 * Revenue is counted only from payments that actually captured, and refunds
 * are subtracted - a dashboard that counts pending orders as revenue is worse
 * than no dashboard.
 */
@Injectable()
export class AnalyticsService {
  private static readonly PAID_STATUSES: Prisma.OrderWhereInput['paymentStatus'] = {
    in: ['CAPTURED', 'PARTIALLY_REFUNDED'],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private resolveRange(from?: string, to?: string): DateRange {
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 29 * 24 * 3600 * 1000);
    start.setUTCHours(0, 0, 0, 0);
    return { from: start, to: end };
  }

  async getDashboard(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const cacheKey = `analytics:dashboard:${range.from.toISOString()}:${range.to.toISOString()}`;

    return this.cache.wrap(cacheKey, CACHE_TTL.ANALYTICS, async () => {
      const paidWhere: Prisma.OrderWhereInput = {
        paymentStatus: AnalyticsService.PAID_STATUSES,
        createdAt: { gte: range.from, lte: range.to },
      };

      const [revenue, orderCount, allOrders, customers, newCustomers, refunds, pending, lowStock] =
        await this.prisma.$transaction([
          this.prisma.order.aggregate({
            where: paidWhere,
            _sum: {
              grandTotal: true,
              subtotal: true,
              shippingTotal: true,
              taxTotal: true,
              discountTotal: true,
            },
            _avg: { grandTotal: true },
            _count: true,
          }),
          this.prisma.order.count({ where: paidWhere }),
          this.prisma.order.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
          this.prisma.user.count({ where: { deletedAt: null, role: { name: 'CUSTOMER' } } }),
          this.prisma.user.count({
            where: {
              deletedAt: null,
              role: { name: 'CUSTOMER' },
              createdAt: { gte: range.from, lte: range.to },
            },
          }),
          this.prisma.refund.aggregate({
            where: {
              status: { in: ['COMPLETED', 'PROCESSING'] },
              createdAt: { gte: range.from, lte: range.to },
            },
            _sum: { amount: true },
            _count: true,
          }),
          this.prisma.order.count({
            where: { status: { in: ['PENDING', 'PAYMENT_CONFIRMED', 'PROCESSING', 'PACKED'] } },
          }),
          this.prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::bigint AS count FROM inventory WHERE quantity <= "lowStockThreshold"
          `,
        ]);

      const grossRevenue = revenue._sum.grandTotal ?? new Prisma.Decimal(0);
      const refunded = refunds._sum.amount ?? new Prisma.Decimal(0);

      return {
        range: { from: range.from, to: range.to },
        revenue: {
          gross: grossRevenue,
          refunded,
          net: grossRevenue.sub(refunded),
          shipping: revenue._sum.shippingTotal ?? new Prisma.Decimal(0),
          tax: revenue._sum.taxTotal ?? new Prisma.Decimal(0),
          discounts: revenue._sum.discountTotal ?? new Prisma.Decimal(0),
          averageOrderValue: revenue._avg.grandTotal ?? new Prisma.Decimal(0),
        },
        orders: {
          paid: orderCount,
          total: allOrders,
          pendingFulfilment: pending,
          // Share of placed orders that actually converted to payment.
          conversionRate: allOrders > 0 ? Number(((orderCount / allOrders) * 100).toFixed(2)) : 0,
        },
        customers: { total: customers, new: newCustomers },
        refunds: { count: refunds._count, amount: refunded },
        alerts: { lowStockVariants: Number(lowStock[0]?.count ?? 0) },
      };
    });
  }

  /** Revenue and order count bucketed by day - drives the dashboard chart. */
  async getSalesTimeSeries(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; revenue: Prisma.Decimal | null; orders: bigint }>
    >`
      SELECT
        date_trunc('day', "createdAt") AS day,
        SUM("grandTotal")              AS revenue,
        COUNT(*)::bigint               AS orders
      FROM orders
      WHERE "paymentStatus" IN ('CAPTURED', 'PARTIALLY_REFUNDED')
        AND "createdAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    // Fill gaps so the chart shows zero days rather than skipping them.
    const byDay = new Map(
      rows.map((r) => [
        r.day.toISOString().slice(0, 10),
        { revenue: Number(r.revenue ?? 0), orders: Number(r.orders) },
      ]),
    );
    const series: Array<{ date: string; revenue: number; orders: number }> = [];
    for (let d = new Date(range.from); d <= range.to; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const entry = byDay.get(key);
      series.push({ date: key, revenue: entry?.revenue ?? 0, orders: entry?.orders ?? 0 });
    }
    return series;
  }

  async getBestSellers(limit = 10, from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const rows = await this.prisma.$queryRaw<
      Array<{
        productId: string;
        productName: string;
        unitsSold: bigint;
        revenue: Prisma.Decimal;
        slug: string | null;
      }>
    >`
      SELECT
        oi."productId",
        oi."productName",
        SUM(oi.quantity)::bigint AS "unitsSold",
        SUM(oi."lineTotal")      AS revenue,
        p.slug
      FROM order_items oi
      JOIN orders o  ON o.id = oi."orderId"
      LEFT JOIN products p ON p.id = oi."productId"
      WHERE o."paymentStatus" IN ('CAPTURED', 'PARTIALLY_REFUNDED')
        AND o."createdAt" BETWEEN ${range.from} AND ${range.to}
        AND oi."productId" IS NOT NULL
      GROUP BY oi."productId", oi."productName", p.slug
      ORDER BY "unitsSold" DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      slug: r.slug,
      unitsSold: Number(r.unitsSold),
      revenue: r.revenue,
    }));
  }

  async getRevenueByCategory(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const rows = await this.prisma.$queryRaw<
      Array<{ categoryId: string; categoryName: string; revenue: Prisma.Decimal; units: bigint }>
    >`
      SELECT c.id AS "categoryId", c.name AS "categoryName",
             SUM(oi."lineTotal") AS revenue, SUM(oi.quantity)::bigint AS units
      FROM order_items oi
      JOIN orders o     ON o.id = oi."orderId"
      JOIN products p   ON p.id = oi."productId"
      JOIN categories c ON c.id = p."categoryId"
      WHERE o."paymentStatus" IN ('CAPTURED', 'PARTIALLY_REFUNDED')
        AND o."createdAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `;
    return rows.map((r) => ({ ...r, units: Number(r.units) }));
  }

  async getOrderStatusBreakdown() {
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      _count: true,
      _sum: { grandTotal: true },
    });
    return rows.map((r) => ({
      status: r.status,
      count: r._count,
      value: r._sum.grandTotal ?? new Prisma.Decimal(0),
    }));
  }

  /** Highest-value customers in the window. */
  async getTopCustomers(limit = 10, from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const rows = await this.prisma.$queryRaw<
      Array<{
        userId: string;
        email: string;
        firstName: string;
        lastName: string | null;
        orders: bigint;
        spend: Prisma.Decimal;
      }>
    >`
      SELECT u.id AS "userId", u.email, u."firstName", u."lastName",
             COUNT(o.id)::bigint AS orders, SUM(o."grandTotal") AS spend
      FROM orders o
      JOIN users u ON u.id = o."userId"
      WHERE o."paymentStatus" IN ('CAPTURED', 'PARTIALLY_REFUNDED')
        AND o."createdAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY u.id, u.email, u."firstName", u."lastName"
      ORDER BY spend DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ ...r, orders: Number(r.orders) }));
  }

  /** Flat rows suitable for CSV export by the admin UI. */
  async getSalesReport(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const orders = await this.prisma.order.findMany({
      where: {
        paymentStatus: AnalyticsService.PAID_STATUSES,
        createdAt: { gte: range.from, lte: range.to },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        orderNumber: true,
        createdAt: true,
        status: true,
        paymentStatus: true,
        subtotal: true,
        discountTotal: true,
        shippingTotal: true,
        taxTotal: true,
        grandTotal: true,
        couponCode: true,
        user: { select: { email: true } },
        guestEmail: true,
        _count: { select: { items: true } },
      },
    });

    return orders.map((o) => ({
      orderNumber: o.orderNumber,
      date: o.createdAt.toISOString(),
      customer: o.user?.email ?? o.guestEmail ?? 'guest',
      status: o.status,
      paymentStatus: o.paymentStatus,
      items: o._count.items,
      subtotal: o.subtotal.toFixed(2),
      discount: o.discountTotal.toFixed(2),
      shipping: o.shippingTotal.toFixed(2),
      tax: o.taxTotal.toFixed(2),
      total: o.grandTotal.toFixed(2),
      coupon: o.couponCode ?? '',
    }));
  }
}
