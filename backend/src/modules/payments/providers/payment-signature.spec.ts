import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { MockPaymentProvider } from './mock.provider';
import { RazorpayProvider } from './razorpay.provider';

const config = (overrides: Record<string, unknown> = {}) =>
  ({
    get: (key: string) =>
      ({
        'payment.razorpay.keyId': 'rzp_test_key',
        'payment.razorpay.keySecret': 'rzp_test_secret',
        'payment.razorpay.webhookSecret': 'whsec_test',
        'payment.razorpay.apiBase': 'https://api.razorpay.com/v1',
        ...overrides,
      })[key],
  }) as unknown as ConfigService;

/**
 * These tests cover the single most security-critical decision in the system:
 * whether a payment actually came from the gateway. A regression here means
 * anyone can mark an order paid.
 */
describe('payment signature verification', () => {
  describe.each([
    ['RazorpayProvider', () => new RazorpayProvider(config())],
    ['MockPaymentProvider', () => new MockPaymentProvider(config())],
  ])('%s', (_name, build) => {
    const provider = build();

    it('accepts a signature computed over order_id|payment_id', () => {
      const signature = createHmac('sha256', 'rzp_test_secret')
        .update('order_ABC|pay_XYZ')
        .digest('hex');

      expect(
        provider.verifyCheckoutSignature({
          providerOrderId: 'order_ABC',
          providerPaymentId: 'pay_XYZ',
          signature,
        }),
      ).toBe(true);
    });

    it('rejects a forged signature', () => {
      expect(
        provider.verifyCheckoutSignature({
          providerOrderId: 'order_ABC',
          providerPaymentId: 'pay_XYZ',
          signature: '0'.repeat(64),
        }),
      ).toBe(false);
    });

    it('rejects a signature bound to a different payment', () => {
      const signature = createHmac('sha256', 'rzp_test_secret')
        .update('order_ABC|pay_OTHER')
        .digest('hex');

      expect(
        provider.verifyCheckoutSignature({
          providerOrderId: 'order_ABC',
          providerPaymentId: 'pay_XYZ',
          signature,
        }),
      ).toBe(false);
    });

    it('rejects an empty or malformed signature without throwing', () => {
      expect(
        provider.verifyCheckoutSignature({
          providerOrderId: 'order_ABC',
          providerPaymentId: 'pay_XYZ',
          signature: '',
        }),
      ).toBe(false);
      expect(
        provider.verifyCheckoutSignature({
          providerOrderId: 'order_ABC',
          providerPaymentId: 'pay_XYZ',
          signature: undefined as unknown as string,
        }),
      ).toBe(false);
    });

    it('verifies webhook signatures over the exact raw body', () => {
      const body = JSON.stringify({ event: 'payment.captured', payload: {} });
      const secret = _name === 'RazorpayProvider' ? 'whsec_test' : 'whsec_test';
      const signature = createHmac('sha256', secret).update(body).digest('hex');

      expect(provider.verifyWebhookSignature(body, signature)).toBe(true);
      expect(provider.verifyWebhookSignature(body, '0'.repeat(64))).toBe(false);
      // A single byte changed anywhere in the body must invalidate it.
      expect(provider.verifyWebhookSignature(`${body} `, signature)).toBe(false);
    });
  });

  it('refuses webhooks when no webhook secret is configured', () => {
    const provider = new RazorpayProvider(config({ 'payment.razorpay.webhookSecret': '' }));
    expect(provider.verifyWebhookSignature('{}', 'anything')).toBe(false);
  });

  it('normalises Razorpay webhook events into our internal shape', () => {
    const provider = new RazorpayProvider(config());
    const event = provider.parseWebhookEvent({
      id: 'evt_1',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: 'pay_1', order_id: 'order_1', amount: 149900, method: 'card' },
        },
      },
    });

    expect(event.eventId).toBe('evt_1');
    expect(event.status).toBe('captured');
    expect(event.providerPaymentId).toBe('pay_1');
    expect(event.providerOrderId).toBe('order_1');
    // Minor units are converted back to store currency at the boundary.
    expect(event.amount).toBe(1499);
  });

  it('maps a failed payment webhook to the failed status', () => {
    const provider = new RazorpayProvider(config());
    const event = provider.parseWebhookEvent({
      id: 'evt_2',
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_2',
            order_id: 'order_2',
            amount: 100,
            error_code: 'BAD_CARD',
            error_description: 'Declined',
          },
        },
      },
    });
    expect(event.status).toBe('failed');
    expect(event.errorCode).toBe('BAD_CARD');
  });

  it('falls back to a stable composite id when the gateway omits one', () => {
    const provider = new RazorpayProvider(config());
    const event = provider.parseWebhookEvent({
      event: 'payment.captured',
      created_at: 1700000000,
      payload: { payment: { entity: { id: 'pay_3' } } },
    });
    // Dedupe depends on this being deterministic for the same delivery.
    expect(event.eventId).toBe('payment.captured:pay_3:1700000000');
  });
});
