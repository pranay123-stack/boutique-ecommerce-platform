import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider as ProviderEnum } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  CreateProviderOrderInput,
  IPaymentProvider,
  NormalizedWebhookEvent,
  ProviderOrder,
  ProviderPayment,
  ProviderRefund,
  RefundInput,
  VerifyCheckoutInput,
} from './payment-provider.interface';

/**
 * Offline payment gateway used for development, CI and E2E runs.
 *
 * Important: this is NOT a stub that returns `true`. It computes and verifies
 * the same HMAC-SHA256 signatures as the live Razorpay adapter, so the
 * signature-verification path - the security-critical part - is exercised by
 * the test suite exactly as it runs in production. Only the network call is
 * replaced.
 *
 * It is selected by PAYMENT_MODE=mock and refuses to load when
 * NODE_ENV=production.
 */
@Injectable()
export class MockPaymentProvider implements IPaymentProvider {
  readonly name = ProviderEnum.RAZORPAY;
  private readonly logger = new Logger(MockPaymentProvider.name);
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly keyId: string;
  private readonly payments = new Map<string, ProviderPayment>();
  /** providerOrderId -> amount, so fetchPayment can report the true figure. */
  private readonly orderAmounts = new Map<string, { amount: number; currency: string }>();

  constructor(config: ConfigService) {
    this.keyId = config.get<string>('payment.razorpay.keyId') || 'rzp_test_mock';
    this.keySecret = config.get<string>('payment.razorpay.keySecret') || 'mock_secret';
    this.webhookSecret =
      config.get<string>('payment.razorpay.webhookSecret') || 'mock_webhook_secret';
    this.logger.warn('Payment gateway running in MOCK mode - no real money will move');
  }

  async createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder> {
    const providerOrderId = `order_mock_${randomBytes(8).toString('hex')}`;
    this.orderAmounts.set(providerOrderId, { amount: input.amount, currency: input.currency });
    return {
      providerOrderId,
      amount: input.amount,
      currency: input.currency,
      publicKey: this.keyId,
      raw: { id: providerOrderId, receipt: input.receipt, mock: true },
    };
  }

  /** Deterministic helper the E2E suite uses to produce a valid client signature. */
  signCheckout(providerOrderId: string, providerPaymentId: string): string {
    return createHmac('sha256', this.keySecret)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest('hex');
  }

  verifyCheckoutSignature(input: VerifyCheckoutInput): boolean {
    const expected = this.signCheckout(input.providerOrderId, input.providerPaymentId);
    return this.constantTimeEquals(expected, input.signature);
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret)
      .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
      .digest('hex');
    return this.constantTimeEquals(expected, signature);
  }

  signWebhook(rawBody: string): string {
    return createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b ?? '', 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  async fetchPayment(
    providerPaymentId: string,
    providerOrderId?: string,
  ): Promise<ProviderPayment> {
    const known = this.payments.get(providerPaymentId);
    if (known) return known;
    // Report the amount the gateway order was actually created for, so the
    // amount-tamper check in PaymentsService is exercised, not bypassed.
    const order = providerOrderId ? this.orderAmounts.get(providerOrderId) : undefined;
    const payment: ProviderPayment = {
      providerPaymentId,
      providerOrderId: providerOrderId ?? null,
      status: 'captured',
      amount: order?.amount ?? 0,
      currency: order?.currency ?? 'INR',
      method: 'mock',
      errorCode: null,
      errorDescription: null,
      raw: { mock: true },
    };
    this.payments.set(providerPaymentId, payment);
    return payment;
  }

  async capture(
    providerPaymentId: string,
    amount: number,
    currency: string,
  ): Promise<ProviderPayment> {
    const payment: ProviderPayment = {
      providerPaymentId,
      providerOrderId: null,
      status: 'captured',
      amount,
      currency,
      method: 'mock',
      errorCode: null,
      errorDescription: null,
      raw: { mock: true, captured: true },
    };
    this.payments.set(providerPaymentId, payment);
    return payment;
  }

  async refund(input: RefundInput): Promise<ProviderRefund> {
    return {
      providerRefundId: `rfnd_mock_${randomBytes(8).toString('hex')}`,
      status: 'processed',
      amount: input.amount,
      raw: { mock: true, idempotencyKey: input.idempotencyKey },
    };
  }

  parseWebhookEvent(payload: any): NormalizedWebhookEvent {
    const eventType: string = payload?.event ?? 'unknown';
    const paymentEntity = payload?.payload?.payment?.entity;
    const refundEntity = payload?.payload?.refund?.entity;
    const statusMap: Record<string, NormalizedWebhookEvent['status']> = {
      'payment.captured': 'captured',
      'payment.authorized': 'authorized',
      'payment.failed': 'failed',
      'refund.processed': 'refund_processed',
    };
    return {
      eventId: payload?.id ?? `${eventType}:${paymentEntity?.id ?? 'unknown'}`,
      eventType,
      providerPaymentId: paymentEntity?.id ?? refundEntity?.payment_id ?? null,
      providerOrderId: paymentEntity?.order_id ?? null,
      providerRefundId: refundEntity?.id ?? null,
      status: statusMap[eventType] ?? 'unknown',
      amount: paymentEntity?.amount ? paymentEntity.amount / 100 : null,
      errorCode: paymentEntity?.error_code ?? null,
      errorDescription: paymentEntity?.error_description ?? null,
    };
  }
}
