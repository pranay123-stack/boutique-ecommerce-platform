import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RefundStatus,
  WebhookStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { OrdersService } from '../orders/orders.service';
import { PAYMENT_PROVIDER, type IPaymentProvider } from './providers/payment-provider.interface';
import { MockPaymentProvider } from './providers/mock.provider';
import { isEqual, money, round2 } from '../../common/utils/money';
import type { CreateRefundDto, VerifyPaymentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly cache: CacheService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: IPaymentProvider,
  ) {}

  /**
   * Which gateway the client should drive.
   *
   * Returned explicitly rather than letting the browser sniff the public key
   * for a substring like "mock": test keys are not required to contain any
   * particular marker, so that inference silently rendered the live gateway
   * widget while the server was in mock mode.
   */
  private gatewayMode(): 'mock' | 'live' {
    return this.provider instanceof MockPaymentProvider ? 'mock' : 'live';
  }

  // ------------------------------------------------------------- checkout

  /**
   * Create a gateway order for an existing, unpaid order.
   *
   * The amount comes from our database, never from the client - this is the
   * boundary where a tampered "amount" field would otherwise let a customer
   * pay 1 rupee for a 10,000 rupee basket.
   */
  async createIntent(orderId: string, identity: { userId?: string; email?: string }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const owns =
      (identity.userId && order.userId === identity.userId) ||
      (!order.userId && identity.email && order.guestEmail === identity.email);
    if (!owns) throw new ForbiddenException('You do not have access to this order');

    if (order.paymentStatus === PaymentStatus.CAPTURED) {
      throw new BadRequestException('This order has already been paid');
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('This order has been cancelled');
    }
    // A COD order is already confirmed and is settled in cash at the door.
    // Sending it to the gateway would let a customer pay twice.
    if (order.payments.some((p) => p.provider === PaymentProvider.COD)) {
      throw new BadRequestException('This is a cash-on-delivery order; no online payment is due');
    }

    // Reuse an outstanding gateway order rather than creating a duplicate when
    // the customer refreshes the payment page.
    const reusable = order.payments.find(
      (p) => p.status === PaymentStatus.CREATED && p.providerOrderId,
    );
    if (reusable?.providerOrderId) {
      return {
        paymentId: reusable.id,
        providerOrderId: reusable.providerOrderId,
        amount: order.grandTotal,
        currency: order.currency,
        publicKey: (reusable.rawPayload as any)?.publicKey ?? '',
        provider: this.provider.name,
        mode: this.gatewayMode(),
        orderNumber: order.orderNumber,
      };
    }

    const providerOrder = await this.provider.createOrder({
      amount: Number(order.grandTotal),
      currency: order.currency,
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: this.provider.name,
        providerOrderId: providerOrder.providerOrderId,
        status: PaymentStatus.CREATED,
        amount: order.grandTotal,
        currency: order.currency,
        idempotencyKey: `intent:${order.id}:${providerOrder.providerOrderId}`,
        rawPayload: {
          publicKey: providerOrder.publicKey,
          providerOrder: providerOrder.raw,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      paymentId: payment.id,
      providerOrderId: providerOrder.providerOrderId,
      amount: order.grandTotal,
      currency: order.currency,
      publicKey: providerOrder.publicKey,
      provider: this.provider.name,
      mode: this.gatewayMode(),
      orderNumber: order.orderNumber,
    };
  }

  /**
   * Verify a completed checkout.
   *
   * Three independent checks, all server-side:
   *   1. HMAC signature over (order_id|payment_id) proves the gateway produced it.
   *   2. The payment is re-fetched from the gateway - the client's claim of
   *      success is never sufficient.
   *   3. The gateway's amount must equal the order total we recorded.
   */
  async verify(dto: VerifyPaymentDto, identity: { userId?: string; email?: string }) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId: dto.orderId, providerOrderId: dto.providerOrderId },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('No payment was initiated for this order');

    const order = payment.order;
    const owns =
      (identity.userId && order.userId === identity.userId) ||
      (!order.userId && identity.email && order.guestEmail === identity.email);
    if (!owns) throw new ForbiddenException('You do not have access to this order');

    if (payment.status === PaymentStatus.CAPTURED) {
      return {
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        alreadyProcessed: true,
      };
    }

    // (1) Signature
    const signatureValid = this.provider.verifyCheckoutSignature({
      providerOrderId: dto.providerOrderId,
      providerPaymentId: dto.providerPaymentId,
      signature: dto.signature,
    });

    if (!signatureValid) {
      this.logger.error(
        `Signature verification FAILED for order ${order.orderNumber} (payment ${dto.providerPaymentId})`,
      );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerPaymentId: dto.providerPaymentId,
          errorCode: 'SIGNATURE_INVALID',
          errorDescription: 'Checkout signature verification failed',
        },
      });
      await this.orders.markPaymentFailed(order.id, 'Signature verification failed');
      throw new BadRequestException('Payment verification failed');
    }

    // (2) Independent read-back from the gateway
    const gatewayPayment = await this.provider.fetchPayment(
      dto.providerPaymentId,
      dto.providerOrderId,
    );

    if (!['captured', 'authorized'].includes(gatewayPayment.status)) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerPaymentId: dto.providerPaymentId,
          errorCode: gatewayPayment.errorCode ?? 'NOT_CAPTURED',
          errorDescription:
            gatewayPayment.errorDescription ?? `Gateway status: ${gatewayPayment.status}`,
        },
      });
      await this.orders.markPaymentFailed(order.id, `Gateway reported ${gatewayPayment.status}`);
      throw new BadRequestException('Payment was not completed');
    }

    // (3) Amount tamper check
    if (
      gatewayPayment.amount > 0 &&
      !isEqual(round2(money(gatewayPayment.amount)), order.grandTotal)
    ) {
      this.logger.error(
        `AMOUNT MISMATCH on ${order.orderNumber}: gateway ${gatewayPayment.amount} vs order ${order.grandTotal.toFixed(2)}`,
      );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerPaymentId: dto.providerPaymentId,
          errorCode: 'AMOUNT_MISMATCH',
          errorDescription: `Expected ${order.grandTotal.toFixed(2)}, gateway reported ${gatewayPayment.amount}`,
        },
      });
      throw new BadRequestException('Payment amount did not match the order total');
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.CAPTURED,
        providerPaymentId: dto.providerPaymentId,
        providerSignature: dto.signature,
        method: gatewayPayment.method,
        capturedAt: new Date(),
        rawPayload: {
          ...(payment.rawPayload as object),
          gatewayPayment: gatewayPayment.raw,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await this.orders.markPaid(order.id, `Payment ${dto.providerPaymentId} captured`);

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      alreadyProcessed: false,
    };
  }

  // -------------------------------------------------------------- webhooks

  /**
   * Process a gateway webhook.
   *
   * Webhooks are the authoritative payment signal: the customer's browser can
   * close before the callback fires, so this path must be able to settle an
   * order on its own. It is idempotent - the same event delivered five times
   * (which gateways do) settles the order exactly once.
   */
  async handleWebhook(rawBody: Buffer | string, signature: string): Promise<{ received: true }> {
    if (!this.provider.verifyWebhookSignature(rawBody, signature)) {
      this.logger.error('Webhook signature verification failed - rejecting');
      throw new ForbiddenException('Invalid webhook signature');
    }

    const payload = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
    const event = this.provider.parseWebhookEvent(payload);

    // Persisting the event first, with a unique (provider, eventId), makes
    // replay a no-op at the database level rather than a race in application code.
    try {
      await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: this.provider.name,
          eventId: event.eventId,
          eventType: event.eventType,
          payload: payload as Prisma.InputJsonValue,
          signature,
          status: WebhookStatus.RECEIVED,
        },
      });
    } catch (err) {
      if ((err as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        this.logger.debug(`Duplicate webhook ${event.eventId} ignored`);
        return { received: true };
      }
      throw err;
    }

    try {
      await this.processWebhookEvent(event);
      await this.prisma.paymentWebhookEvent.update({
        where: { provider_eventId: { provider: this.provider.name, eventId: event.eventId } },
        data: { status: WebhookStatus.PROCESSED, processedAt: new Date() },
      });
    } catch (err) {
      this.logger.error(`Webhook ${event.eventId} processing failed: ${(err as Error).message}`);
      await this.prisma.paymentWebhookEvent.update({
        where: { provider_eventId: { provider: this.provider.name, eventId: event.eventId } },
        data: { status: WebhookStatus.FAILED, error: (err as Error).message },
      });
      // Still 200: the event is stored and retried by the reconciliation job.
      // Returning 5xx would make the gateway hammer us with retries.
    }

    return { received: true };
  }

  private async processWebhookEvent(
    event: ReturnType<IPaymentProvider['parseWebhookEvent']>,
  ): Promise<void> {
    if (!event.providerPaymentId && !event.providerOrderId) return;

    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          ...(event.providerPaymentId ? [{ providerPaymentId: event.providerPaymentId }] : []),
          ...(event.providerOrderId ? [{ providerOrderId: event.providerOrderId }] : []),
        ],
      },
      include: { order: true },
    });
    if (!payment) {
      this.logger.warn(`Webhook ${event.eventType} referenced an unknown payment; skipping`);
      return;
    }

    switch (event.status) {
      case 'captured':
      case 'authorized': {
        if (payment.status === PaymentStatus.CAPTURED) return;
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.CAPTURED,
            providerPaymentId: event.providerPaymentId ?? payment.providerPaymentId,
            capturedAt: new Date(),
          },
        });
        await this.orders.markPaid(payment.orderId, `Settled by webhook ${event.eventType}`);
        break;
      }
      case 'failed': {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            errorCode: event.errorCode,
            errorDescription: event.errorDescription,
          },
        });
        await this.orders.markPaymentFailed(
          payment.orderId,
          event.errorDescription ?? 'Payment failed at gateway',
        );
        break;
      }
      case 'refund_processed': {
        if (event.providerRefundId) {
          await this.prisma.refund.updateMany({
            where: { providerRefundId: event.providerRefundId },
            data: { status: RefundStatus.COMPLETED, processedAt: new Date() },
          });
        }
        break;
      }
      default:
        this.logger.debug(`Unhandled webhook event type ${event.eventType}`);
    }
  }

  // --------------------------------------------------------------- refunds

  async createRefund(orderId: string, dto: CreateRefundDto, actorUserId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { where: { status: PaymentStatus.CAPTURED } }, refunds: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const payment = order.payments[0];
    if (!payment) throw new BadRequestException('This order has no captured payment to refund');

    const alreadyRefunded = order.refunds
      .filter((r) => r.status !== RefundStatus.FAILED)
      .reduce<Prisma.Decimal>((sum, r) => sum.add(r.amount), new Prisma.Decimal(0));

    const requested = money(dto.amount);
    const refundable = payment.amount.sub(alreadyRefunded);

    if (requested.greaterThan(refundable)) {
      throw new BadRequestException(
        `Only ${refundable.toFixed(2)} remains refundable on this order`,
      );
    }

    // A stable key means a retried request cannot issue a second refund.
    const idempotencyKey = `refund:${orderId}:${alreadyRefunded.toFixed(2)}:${requested.toFixed(2)}`;

    const refund = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        orderId: order.id,
        amount: requested,
        currency: order.currency,
        reason: dto.reason ?? null,
        status: RefundStatus.PROCESSING,
        requestedByUserId: actorUserId,
      },
    });

    try {
      const providerRefund = await this.provider.refund({
        providerPaymentId: payment.providerPaymentId as string,
        amount: Number(requested),
        notes: { orderNumber: order.orderNumber, refundId: refund.id },
        idempotencyKey,
      });

      const totalRefunded = alreadyRefunded.add(requested);
      const fullyRefunded = totalRefunded.greaterThanOrEqualTo(payment.amount);

      await this.prisma.$transaction([
        this.prisma.refund.update({
          where: { id: refund.id },
          data: {
            providerRefundId: providerRefund.providerRefundId,
            status:
              providerRefund.status === 'processed'
                ? RefundStatus.COMPLETED
                : RefundStatus.PROCESSING,
            processedAt: providerRefund.status === 'processed' ? new Date() : null,
            rawPayload: providerRefund.raw as Prisma.InputJsonValue,
          },
        }),
        this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            amountRefunded: totalRefunded,
            status: fullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
          },
        }),
        this.prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: fullyRefunded
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PARTIALLY_REFUNDED,
            ...(fullyRefunded ? { status: OrderStatus.REFUNDED } : {}),
          },
        }),
      ]);

      this.events.emit('refund.processed', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        email: order.guestEmail,
        amount: requested.toFixed(2),
      });

      return this.prisma.refund.findUnique({ where: { id: refund.id } });
    } catch (err) {
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: { status: RefundStatus.FAILED, notes: (err as Error).message },
      });
      throw err;
    }
  }

  // -------------------------------------------------------- reconciliation

  /**
   * Safety net for the case that breaks naive integrations: the customer paid,
   * the callback never arrived and the webhook was lost. Re-reads every stale
   * pending payment directly from the gateway and settles what actually cleared.
   */
  async reconcilePendingPayments(
    olderThanMinutes = 15,
  ): Promise<{ checked: number; settled: number }> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const pending = await this.prisma.payment.findMany({
      where: {
        status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] },
        createdAt: { lt: cutoff },
        providerPaymentId: { not: null },
      },
      take: 100,
      include: { order: true },
    });

    let settled = 0;
    for (const payment of pending) {
      try {
        const gateway = await this.provider.fetchPayment(
          payment.providerPaymentId as string,
          payment.providerOrderId ?? undefined,
        );
        if (
          gateway.status === 'captured' &&
          isEqual(round2(money(gateway.amount)), payment.amount)
        ) {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.CAPTURED, capturedAt: new Date() },
          });
          await this.orders.markPaid(payment.orderId, 'Settled by reconciliation job');
          settled += 1;
          this.logger.warn(`Reconciliation settled order ${payment.order.orderNumber}`);
        }
      } catch (err) {
        this.logger.error(
          `Reconciliation failed for payment ${payment.id}: ${(err as Error).message}`,
        );
      }
    }
    return { checked: pending.length, settled };
  }

  /** Retry webhook events whose processing previously threw. */
  async retryFailedWebhooks(): Promise<{ retried: number }> {
    const failed = await this.prisma.paymentWebhookEvent.findMany({
      where: { status: WebhookStatus.FAILED },
      take: 50,
      orderBy: { createdAt: 'asc' },
    });

    let retried = 0;
    for (const record of failed) {
      try {
        const event = this.provider.parseWebhookEvent(record.payload);
        await this.processWebhookEvent(event);
        await this.prisma.paymentWebhookEvent.update({
          where: { id: record.id },
          data: { status: WebhookStatus.PROCESSED, processedAt: new Date(), error: null },
        });
        retried += 1;
      } catch (err) {
        await this.prisma.paymentWebhookEvent.update({
          where: { id: record.id },
          data: { error: (err as Error).message },
        });
      }
    }
    return { retried };
  }

  /**
   * Development-only: complete a payment without a real gateway.
   *
   * Signs the checkout exactly as the gateway would and then runs the *real*
   * verification path - so the flow exercised in dev and CI is the same code
   * that runs in production, rather than a shortcut around it.
   *
   * Hard-blocked unless the mock provider is the one actually wired up, which
   * PaymentsModule already refuses to do when NODE_ENV=production.
   */
  async completeMockPayment(orderId: string, identity: { userId?: string; email?: string }) {
    if (!(this.provider instanceof MockPaymentProvider)) {
      throw new ForbiddenException('Mock payment completion is disabled');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: PaymentStatus.CREATED },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment?.providerOrderId) {
      throw new BadRequestException('No pending payment found for this order');
    }

    const providerPaymentId = `pay_mock_${Date.now().toString(36)}`;
    const signature = this.provider.signCheckout(payment.providerOrderId, providerPaymentId);

    return this.verify(
      {
        orderId,
        providerOrderId: payment.providerOrderId,
        providerPaymentId,
        signature,
      },
      identity,
    );
  }

  async findByOrder(orderId: string) {
    return this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        status: true,
        amount: true,
        amountRefunded: true,
        method: true,
        providerPaymentId: true,
        createdAt: true,
        capturedAt: true,
        errorCode: true,
        errorDescription: true,
      },
    });
  }
}
