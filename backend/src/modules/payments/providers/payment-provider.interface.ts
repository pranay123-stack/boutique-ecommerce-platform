import type { PaymentProvider as ProviderEnum } from '@prisma/client';

export interface CreateProviderOrderInput {
  /** Amount in store currency (e.g. 1499.00), converted to minor units by the adapter. */
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface ProviderOrder {
  providerOrderId: string;
  amount: number;
  currency: string;
  /** Public key/identifier the browser SDK needs. Never a secret. */
  publicKey: string;
  raw: unknown;
}

export interface VerifyCheckoutInput {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export interface ProviderPayment {
  providerPaymentId: string;
  providerOrderId: string | null;
  status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
  amount: number;
  currency: string;
  method: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  raw: unknown;
}

export interface RefundInput {
  providerPaymentId: string;
  amount: number;
  notes?: Record<string, string>;
  idempotencyKey: string;
}

export interface ProviderRefund {
  providerRefundId: string;
  status: 'pending' | 'processed' | 'failed';
  amount: number;
  raw: unknown;
}

export interface NormalizedWebhookEvent {
  eventId: string;
  eventType: string;
  providerPaymentId: string | null;
  providerOrderId: string | null;
  providerRefundId: string | null;
  status: ProviderPayment['status'] | 'refund_processed' | 'unknown';
  amount: number | null;
  errorCode: string | null;
  errorDescription: string | null;
}

/**
 * Contract every payment gateway adapter satisfies.
 *
 * Adding Stripe or PayPal later means implementing this interface and
 * registering it - no changes to orders, refunds or webhook handling.
 */
export interface IPaymentProvider {
  readonly name: ProviderEnum;

  createOrder(input: CreateProviderOrderInput): Promise<ProviderOrder>;

  /** Verifies the signature the browser returns after checkout completes. */
  verifyCheckoutSignature(input: VerifyCheckoutInput): boolean;

  /**
   * Authoritative payment state, read back from the gateway.
   * `providerOrderId` is a hint some adapters use to resolve the expected
   * amount; live gateways ignore it and answer from the payment id alone.
   */
  fetchPayment(providerPaymentId: string, providerOrderId?: string): Promise<ProviderPayment>;

  capture(providerPaymentId: string, amount: number, currency: string): Promise<ProviderPayment>;

  refund(input: RefundInput): Promise<ProviderRefund>;

  /** Verifies a webhook against the exact bytes received. */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean;

  parseWebhookEvent(payload: any): NormalizedWebhookEvent;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
