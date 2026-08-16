import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { ShippingService } from '../shipping/shipping.service';
import { CacheService } from '../../redis/cache.service';

/**
 * Scheduled maintenance.
 *
 * Each job is guarded by a short-lived Redis lock so that running several API
 * instances does not mean running each job several times - a duplicated
 * reconciliation pass could double-settle an order.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly shipping: ShippingService,
    private readonly cache: CacheService,
    config: ConfigService,
  ) {
    // Cron in tests would make suites non-deterministic.
    this.enabled = !config.get<boolean>('app.isTest');
  }

  private async withLock(name: string, ttlMs: number, fn: () => Promise<void>): Promise<void> {
    if (!this.enabled) return;
    const token = await this.cache.acquireLock(`cron:${name}`, ttlMs);
    if (!token) {
      this.logger.debug(`Skipping ${name}; another instance holds the lock`);
      return;
    }
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Cron ${name} failed: ${(err as Error).message}`);
    } finally {
      await this.cache.releaseLock(`cron:${name}`, token);
    }
  }

  /** Settle payments that cleared at the gateway but whose callback was lost. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcilePayments(): Promise<void> {
    await this.withLock('reconcile-payments', 9 * 60_000, async () => {
      const result = await this.payments.reconcilePendingPayments(15);
      if (result.settled > 0) {
        this.logger.warn(`Reconciliation settled ${result.settled}/${result.checked} payments`);
      }
    });
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async retryWebhooks(): Promise<void> {
    await this.withLock('retry-webhooks', 25 * 60_000, async () => {
      const { retried } = await this.payments.retryFailedWebhooks();
      if (retried) this.logger.log(`Re-processed ${retried} failed webhook events`);
    });
  }

  /** Keep customer-facing tracking fresh without them having to ask. */
  @Cron(CronExpression.EVERY_HOUR)
  async syncShipmentTracking(): Promise<void> {
    await this.withLock('sync-tracking', 50 * 60_000, async () => {
      const result = await this.shipping.syncAllActive();
      this.logger.log(`Tracking sync: ${result.synced} updated, ${result.failed} failed`);
    });
  }

  /**
   * Release stock held by orders that were never paid.
   *
   * Without this, an abandoned checkout would hold inventory hostage forever
   * and the store would show "out of stock" while nothing had actually sold.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireStaleOrders(): Promise<void> {
    await this.withLock('expire-orders', 9 * 60_000, async () => {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour
      const stale = await this.prisma.order.findMany({
        where: { status: 'PENDING', paymentStatus: 'PENDING', createdAt: { lt: cutoff } },
        select: { id: true, orderNumber: true },
        take: 100,
      });

      for (const order of stale) {
        try {
          await this.payments.reconcilePendingPayments(0);
          const current = await this.prisma.order.findUnique({
            where: { id: order.id },
            select: { paymentStatus: true },
          });
          // Only expire if it is still genuinely unpaid after re-checking.
          if (current?.paymentStatus === 'PENDING') {
            await this.prisma.order.update({
              where: { id: order.id },
              data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancelReason: 'Payment not completed in time',
              },
            });
            this.logger.log(`Expired unpaid order ${order.orderNumber}`);
          }
        } catch (err) {
          this.logger.error(
            `Failed to expire order ${order.orderNumber}: ${(err as Error).message}`,
          );
        }
      }
    });
  }

  /** Housekeeping: drop expired tokens and abandoned guest carts. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup(): Promise<void> {
    await this.withLock('cleanup', 30 * 60_000, async () => {
      const now = new Date();
      const [tokens, resets, verifications, carts] = await this.prisma.$transaction([
        this.prisma.refreshToken.deleteMany({
          where: {
            OR: [
              { expiresAt: { lt: now } },
              { revokedAt: { lt: new Date(now.getTime() - 30 * 24 * 3600 * 1000) } },
            ],
          },
        }),
        this.prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
        this.prisma.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
        this.prisma.cart.deleteMany({
          where: { status: 'ACTIVE', userId: null, expiresAt: { lt: now } },
        }),
      ]);
      this.logger.log(
        `Cleanup removed ${tokens.count} refresh tokens, ${resets.count} resets, ` +
          `${verifications.count} verifications, ${carts.count} guest carts`,
      );
    });
  }

  /** Mark long-idle carts so they can be targeted by recovery campaigns. */
  @Cron(CronExpression.EVERY_6_HOURS)
  async flagAbandonedCarts(): Promise<void> {
    await this.withLock('abandoned-carts', 30 * 60_000, async () => {
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
      const result = await this.prisma.cart.updateMany({
        where: { status: 'ACTIVE', updatedAt: { lt: cutoff }, items: { some: {} } },
        data: { status: 'ABANDONED' },
      });
      if (result.count) this.logger.log(`Flagged ${result.count} abandoned carts`);
    });
  }
}
