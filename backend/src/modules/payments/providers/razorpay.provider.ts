import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider as ProviderEnum } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
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
import { toMinorUnits } from '../../../common/utils/money';

/**
 * Razorpay adapter.
 *
 * Implemented directly against the REST API rather than the vendor SDK: it
 * keeps the dependency surface small, makes every request explicitly typed,
 * and lets us control timeouts and retries.
 */
@Injectable()
export class RazorpayProvider implements IPaymentProvider {
  readonly name = ProviderEnum.RAZORPAY;
  private readonly logger = new Logger(RazorpayProvider.name);
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly apiBase: string;

  constructor(config: ConfigService) {
    this.keyId = config.get<string>('payment.razorpay.keyId') ?? '';
    this.keySecret = config.get<string>('payment.razorpay.keySecret') ?? '';
    this.webhookSecret = config.get<string>('payment.razorpay.webhookSecret') ?? '';
    this.apiBase = config.get<string>('payment.razorpay.apiBase') ?? 'https://api.razorpay.com/v1';
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${this.apiBase}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: this.authHeader(),
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
      const body = (await response.json().catch(() => ({}))) as any;
      if (!response.ok) {
        const description = body?.error?.description ?? response.statusText;
        this.logger.error(`Razorpay ${path} failed (${response.status}): ${description}`);
        throw new ServiceUnavailableException(`Payment gateway error: ${description}`);
      }
      return body as T;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new ServiceUnavailableException('Payment gateway timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder> {
    const body = await this.request<any>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: toMinorUnits(input.amount),
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes ?? {},
        payment_capture: 1,
      }),
    });
    return {
      providerOrderId: body.id,
      amount: input.amount,
      currency: input.currency,
      publicKey: this.keyId,
      raw: body,
    };
  }

  /**
   * The browser hands back `razorpay_signature = HMAC_SHA256(order_id|payment_id, key_secret)`.
   * Verifying it server-side is what stops a client claiming an unpaid order is paid.
   */
  verifyCheckoutSignature(input: VerifyCheckoutInput): boolean {
    const expected = createHmac('sha256', this.keySecret)
      .update(`${input.providerOrderId}|${input.providerPaymentId}`)
      .digest('hex');
    return this.constantTimeEquals(expected, input.signature);
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.error('Webhook received but RAZORPAY_WEBHOOK_SECRET is not configured');
      return false;
    }
    const expected = createHmac('sha256', this.webhookSecret)
      .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
      .digest('hex');
    return this.constantTimeEquals(expected, signature);
  }

  private constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b ?? '', 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  async fetchPayment(
    providerPaymentId: string,
    _providerOrderId?: string,
  ): Promise<ProviderPayment> {
    const body = await this.request<any>(`/payments/${providerPaymentId}`);
    return this.mapPayment(body);
  }

  async capture(
    providerPaymentId: string,
    amount: number,
    currency: string,
  ): Promise<ProviderPayment> {
    const body = await this.request<any>(`/payments/${providerPaymentId}/capture`, {
      method: 'POST',
      body: JSON.stringify({ amount: toMinorUnits(amount), currency }),
    });
    return this.mapPayment(body);
  }

  async refund(input: RefundInput): Promise<ProviderRefund> {
    const body = await this.request<any>(`/payments/${input.providerPaymentId}/refund`, {
      method: 'POST',
      // Razorpay dedupes on this header, so a retried refund cannot double-pay.
      headers: { 'X-Razorpay-Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({
        amount: toMinorUnits(input.amount),
        notes: input.notes ?? {},
        speed: 'normal',
      }),
    });
    return {
      providerRefundId: body.id,
      status:
        body.status === 'processed' ? 'processed' : body.status === 'failed' ? 'failed' : 'pending',
      amount: (body.amount ?? 0) / 100,
      raw: body,
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
      'refund.created': 'refund_processed',
    };

    return {
      // Razorpay does not always send a top-level id; fall back to a stable
      // composite so webhook dedupe still works.
      eventId:
        payload?.id ??
        `${eventType}:${paymentEntity?.id ?? refundEntity?.id ?? 'unknown'}:${payload?.created_at ?? ''}`,
      eventType,
      providerPaymentId: paymentEntity?.id ?? refundEntity?.payment_id ?? null,
      providerOrderId: paymentEntity?.order_id ?? null,
      providerRefundId: refundEntity?.id ?? null,
      status: statusMap[eventType] ?? 'unknown',
      amount: paymentEntity?.amount
        ? paymentEntity.amount / 100
        : refundEntity?.amount
          ? refundEntity.amount / 100
          : null,
      errorCode: paymentEntity?.error_code ?? null,
      errorDescription: paymentEntity?.error_description ?? null,
    };
  }

  private mapPayment(body: any): ProviderPayment {
    return {
      providerPaymentId: body.id,
      providerOrderId: body.order_id ?? null,
      status: body.status,
      amount: (body.amount ?? 0) / 100,
      currency: body.currency,
      method: body.method ?? null,
      errorCode: body.error_code ?? null,
      errorDescription: body.error_description ?? null,
      raw: body,
    };
  }
}
