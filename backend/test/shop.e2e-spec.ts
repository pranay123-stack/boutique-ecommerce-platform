import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ADDRESS, API, createTestApp, seedFixtures } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { CacheService } from '../src/redis/cache.service';
import { MockPaymentProvider } from '../src/modules/payments/providers/mock.provider';

describe('Storefront purchase flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cache: CacheService;
  let fixtures: Awaited<ReturnType<typeof seedFixtures>>;
  let token: string;
  let mockProvider: MockPaymentProvider;

  beforeAll(async () => {
    ({ app, prisma, cache } = await createTestApp());
    mockProvider = app.get(MockPaymentProvider);
  });

  beforeEach(async () => {
    fixtures = await seedFixtures(prisma, cache);
    const login = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: 'customer@test.local', password: 'Test@12345' });
    token = login.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  // ------------------------------------------------------------- catalogue

  describe('catalogue', () => {
    it('lists active products with derived commercial fields', async () => {
      const res = await request(server()).get(`${API}/products`).expect(200);
      expect(res.body.data).toHaveLength(1);
      const product = res.body.data[0];
      expect(product.slug).toBe('test-silk-scarf');
      expect(product.inStock).toBe(true);
      expect(product.discountPercent).toBe(29); // 1400 -> 1000
      expect(product.totalAvailable).toBe(11);
    });

    it('hides draft and archived products from the storefront', async () => {
      await prisma.product.update({
        where: { slug: 'test-silk-scarf' },
        data: { status: 'DRAFT' },
      });
      const res = await request(server()).get(`${API}/products`).expect(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('finds a product by full-text search', async () => {
      const res = await request(server()).get(`${API}/products?q=silk`).expect(200);
      expect(res.body.meta.total).toBe(1);
    });

    it('tolerates a misspelled search term', async () => {
      const res = await request(server()).get(`${API}/products?q=scrf`).expect(200);
      expect(res.body.meta.total).toBe(1);
    });

    it('returns nothing for an unrelated term', async () => {
      const res = await request(server()).get(`${API}/products?q=motorcycle`).expect(200);
      expect(res.body.meta.total).toBe(0);
    });

    it('filters by price range', async () => {
      const below = await request(server()).get(`${API}/products?maxPrice=500`).expect(200);
      expect(below.body.meta.total).toBe(0);
      const within = await request(server())
        .get(`${API}/products?minPrice=500&maxPrice=1500`)
        .expect(200);
      expect(within.body.meta.total).toBe(1);
    });

    it('rejects a page size above the hard cap', async () => {
      await request(server()).get(`${API}/products?limit=5000`).expect(400);
    });

    it('serves product detail with variants and an option matrix', async () => {
      const res = await request(server()).get(`${API}/products/test-silk-scarf`).expect(200);
      expect(res.body.data.variants).toHaveLength(2);
      expect(res.body.data.variants[0].available).toBe(10);
    });

    it('404s an unknown slug', async () => {
      await request(server()).get(`${API}/products/nope`).expect(404);
    });
  });

  // ------------------------------------------------------------------ cart

  describe('cart', () => {
    it('adds an item and prices it', async () => {
      const res = await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 2 })
        .expect(201);

      expect(res.body.data.itemCount).toBe(2);
      expect(res.body.data.subtotal).toBe('2000');
      expect(res.body.data.taxTotal).toBe('100');
      expect(res.body.data.shippingTotal).toBe('0'); // over free-shipping threshold
      expect(res.body.data.grandTotal).toBe('2100');
    });

    it('refuses to add more than is in stock', async () => {
      await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 50 })
        .expect(400);
    });

    it('accumulates quantity when the same variant is added twice', async () => {
      await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 2 })
        .expect(201);
      const res = await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 3 })
        .expect(201);
      expect(res.body.data.itemCount).toBe(5);
    });

    it('keeps a guest cart separate from a member cart', async () => {
      await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 1 })
        .expect(201);

      const guest = await request(server())
        .post(`${API}/cart/items`)
        .set('X-Session-Id', 'guest-session-abc')
        .send({ variantId: fixtures.variant.id, quantity: 4 })
        .expect(201);

      expect(guest.body.data.itemCount).toBe(4);

      const member = await request(server()).get(`${API}/cart`).set(auth()).expect(200);
      expect(member.body.data.itemCount).toBe(1);
    });

    it('merges a guest cart into the member cart on demand', async () => {
      await request(server())
        .post(`${API}/cart/items`)
        .set('X-Session-Id', 'guest-merge')
        .send({ variantId: fixtures.variant.id, quantity: 3 })
        .expect(201);

      const merged = await request(server())
        .post(`${API}/cart/merge`)
        .set(auth())
        .send({ sessionId: 'guest-merge' })
        .expect(201);

      expect(merged.body.data.itemCount).toBe(3);
    });

    it('applies a valid coupon', async () => {
      await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 2 })
        .expect(201);

      const res = await request(server())
        .post(`${API}/cart/coupon`)
        .set(auth())
        .send({ code: 'SAVE10' })
        .expect(201);

      expect(res.body.data.discountTotal).toBe('200');
      // Tax follows the discounted amount, not the list price.
      expect(res.body.data.taxTotal).toBe('90');
      // The discount drops goods from 2000 to 1800, back below the 1999 free
      // shipping threshold, so the 99 shipping charge legitimately returns.
      expect(res.body.data.shippingTotal).toBe('99');
      expect(res.body.data.grandTotal).toBe('1989');
    });

    it('rejects an expired coupon', async () => {
      await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 2 })
        .expect(201);
      await request(server())
        .post(`${API}/cart/coupon`)
        .set(auth())
        .send({ code: 'EXPIRED' })
        .expect(400);
    });

    it('rejects a coupon below its minimum order value', async () => {
      await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 1 })
        .expect(201);
      await request(server())
        .post(`${API}/cart/coupon`)
        .set(auth())
        .send({ code: 'BIGSPEND' })
        .expect(400);
    });

    it('removes a line when quantity is set to zero', async () => {
      const added = await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 2 })
        .expect(201);
      const itemId = added.body.data.items[0].id;

      const res = await request(server())
        .patch(`${API}/cart/items/${itemId}`)
        .set(auth())
        .send({ quantity: 0 })
        .expect(200);
      expect(res.body.data.itemCount).toBe(0);
    });
  });

  // ------------------------------------------------------- order + payment

  describe('checkout and payment', () => {
    const addToCart = async (quantity = 2) => {
      await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity })
        .expect(201);
    };

    it('creates an order that matches the cart total exactly', async () => {
      await addToCart();
      const cart = await request(server()).get(`${API}/cart`).set(auth()).expect(200);

      const res = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);

      expect(res.body.data.grandTotal).toBe(cart.body.data.grandTotal);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.paymentStatus).toBe('PENDING');
      expect(res.body.data.orderNumber).toMatch(/^BQ-\d{8}-[A-Z0-9]{6}$/);
    });

    it('reserves stock without decrementing it until payment', async () => {
      await addToCart(3);
      await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);

      const inventory = await prisma.inventory.findUnique({
        where: { variantId: fixtures.variant.id },
      });
      expect(inventory!.quantity).toBe(10);
      expect(inventory!.reservedQuantity).toBe(3);
    });

    it('empties the cart after checkout', async () => {
      await addToCart();
      await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);
      const cart = await request(server()).get(`${API}/cart`).set(auth()).expect(200);
      expect(cart.body.data.itemCount).toBe(0);
    });

    it('refuses to create an order from an empty cart', async () => {
      await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(400);
    });

    it('prevents overselling the last unit under concurrency', async () => {
      // lowStockVariant has exactly 1 unit. Two shoppers race for it.
      await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.lowStockVariant.id, quantity: 1 })
        .expect(201);
      await request(server())
        .post(`${API}/cart/items`)
        .set('X-Session-Id', 'racer-2')
        .send({ variantId: fixtures.lowStockVariant.id, quantity: 1 })
        .expect(201);

      const [first, second] = await Promise.all([
        request(server()).post(`${API}/orders`).set(auth()).send({ shippingAddress: ADDRESS }),
        request(server())
          .post(`${API}/orders`)
          .set('X-Session-Id', 'racer-2')
          .send({ shippingAddress: ADDRESS, guestEmail: 'racer2@test.local' }),
      ]);

      const statuses = [first.status, second.status].sort();
      // Exactly one wins; the other is rejected for insufficient stock.
      expect(statuses).toEqual([201, 400]);

      const inventory = await prisma.inventory.findUnique({
        where: { variantId: fixtures.lowStockVariant.id },
      });
      expect(inventory!.reservedQuantity).toBe(1);
      expect(inventory!.quantity).toBe(1);
    });

    it('rejects a forged payment signature and leaves the order unpaid', async () => {
      await addToCart();
      const order = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);
      const orderId = order.body.data.id;

      const intent = await request(server())
        .post(`${API}/payments/intent`)
        .set(auth())
        .send({ orderId })
        .expect(201);

      await request(server())
        .post(`${API}/payments/verify`)
        .set(auth())
        .send({
          orderId,
          providerOrderId: intent.body.data.providerOrderId,
          providerPaymentId: 'pay_forged',
          signature: '0'.repeat(64),
        })
        .expect(400);

      const after = await prisma.order.findUnique({ where: { id: orderId } });
      expect(after!.paymentStatus).toBe('FAILED');
      expect(after!.status).toBe('PENDING');
    });

    it('accepts a genuine signature and settles the order', async () => {
      await addToCart();
      const order = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);
      const orderId = order.body.data.id;

      const intent = await request(server())
        .post(`${API}/payments/intent`)
        .set(auth())
        .send({ orderId })
        .expect(201);

      const providerOrderId = intent.body.data.providerOrderId;
      const providerPaymentId = 'pay_genuine_1';
      const signature = mockProvider.signCheckout(providerOrderId, providerPaymentId);

      const verified = await request(server())
        .post(`${API}/payments/verify`)
        .set(auth())
        .send({ orderId, providerOrderId, providerPaymentId, signature })
        .expect(200);

      expect(verified.body.data.success).toBe(true);

      const after = await prisma.order.findUnique({ where: { id: orderId } });
      expect(after!.paymentStatus).toBe('CAPTURED');
      expect(after!.status).toBe('PAYMENT_CONFIRMED');
    });

    it('commits stock once payment is captured', async () => {
      await addToCart(3);
      const order = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);
      const orderId = order.body.data.id;

      const intent = await request(server())
        .post(`${API}/payments/intent`)
        .set(auth())
        .send({ orderId })
        .expect(201);
      const providerOrderId = intent.body.data.providerOrderId;

      await request(server())
        .post(`${API}/payments/verify`)
        .set(auth())
        .send({
          orderId,
          providerOrderId,
          providerPaymentId: 'pay_commit',
          signature: mockProvider.signCheckout(providerOrderId, 'pay_commit'),
        })
        .expect(200);

      const inventory = await prisma.inventory.findUnique({
        where: { variantId: fixtures.variant.id },
      });
      expect(inventory!.quantity).toBe(7);
      expect(inventory!.reservedQuantity).toBe(0);
    });

    it('is idempotent when the same verification arrives twice', async () => {
      await addToCart();
      const order = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);
      const orderId = order.body.data.id;
      const intent = await request(server())
        .post(`${API}/payments/intent`)
        .set(auth())
        .send({ orderId })
        .expect(201);
      const providerOrderId = intent.body.data.providerOrderId;
      const payload = {
        orderId,
        providerOrderId,
        providerPaymentId: 'pay_dup',
        signature: mockProvider.signCheckout(providerOrderId, 'pay_dup'),
      };

      await request(server()).post(`${API}/payments/verify`).set(auth()).send(payload).expect(200);
      const second = await request(server())
        .post(`${API}/payments/verify`)
        .set(auth())
        .send(payload)
        .expect(200);

      expect(second.body.data.alreadyProcessed).toBe(true);

      // Stock must not be decremented a second time.
      const inventory = await prisma.inventory.findUnique({
        where: { variantId: fixtures.variant.id },
      });
      expect(inventory!.quantity).toBe(8);
    });

    it('releases reserved stock when an order is cancelled before payment', async () => {
      await addToCart(4);
      const order = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);

      await request(server())
        .patch(`${API}/orders/${order.body.data.id}/cancel`)
        .set(auth())
        .send({ reason: 'Changed my mind' })
        .expect(200);

      const inventory = await prisma.inventory.findUnique({
        where: { variantId: fixtures.variant.id },
      });
      expect(inventory!.reservedQuantity).toBe(0);
      expect(inventory!.quantity).toBe(10);
    });

    it('lets the same customer place a second order (cart slot is freed)', async () => {
      // Regression: Cart.userId was globally unique, so the CONVERTED cart from
      // the first order kept owning the slot and the next add-to-cart failed
      // with a unique-constraint violation - a customer could buy exactly once,
      // ever. Uniqueness is now scoped to ACTIVE carts by a partial index.
      await addToCart(2);
      const first = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);

      await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 1 })
        .expect(201);

      const second = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);

      expect(second.body.data.id).not.toBe(first.body.data.id);
      expect(second.body.data.orderNumber).not.toBe(first.body.data.orderNumber);

      const orders = await prisma.order.findMany({ where: { userId: fixtures.customer.id } });
      expect(orders).toHaveLength(2);

      // And a third, to prove it is not a one-off.
      await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 1 })
        .expect(201);
      await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);
    });

    it('supports guest checkout end to end', async () => {
      await request(server())
        .post(`${API}/cart/items`)
        .set('X-Session-Id', 'guest-buyer')
        .send({ variantId: fixtures.variant.id, quantity: 2 })
        .expect(201);

      const order = await request(server())
        .post(`${API}/orders`)
        .set('X-Session-Id', 'guest-buyer')
        .send({ shippingAddress: ADDRESS, guestEmail: 'guest@test.local' })
        .expect(201);

      expect(order.body.data.guestEmail).toBe('guest@test.local');
      expect(order.body.data.userId).toBeNull();

      // A guest can retrieve their order with the email they checked out with.
      await request(server())
        .get(`${API}/orders/${order.body.data.id}?email=guest@test.local`)
        .expect(200);
    });

    it('refuses guest checkout without an email', async () => {
      await request(server())
        .post(`${API}/cart/items`)
        .set('X-Session-Id', 'guest-noemail')
        .send({ variantId: fixtures.variant.id, quantity: 1 })
        .expect(201);
      await request(server())
        .post(`${API}/orders`)
        .set('X-Session-Id', 'guest-noemail')
        .send({ shippingAddress: ADDRESS })
        .expect(400);
    });

    it('stops one customer reading another customer order', async () => {
      await addToCart();
      const order = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);

      // No credentials at all.
      await request(server()).get(`${API}/orders/${order.body.data.id}`).expect(403);
      // Wrong guest email.
      await request(server())
        .get(`${API}/orders/${order.body.data.id}?email=someone-else@test.local`)
        .expect(403);
    });

    it('records a coupon redemption against the order', async () => {
      await addToCart();
      await request(server())
        .post(`${API}/cart/coupon`)
        .set(auth())
        .send({ code: 'SAVE10' })
        .expect(201);

      const order = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);

      expect(order.body.data.couponCode).toBe('SAVE10');
      const redemptions = await prisma.couponRedemption.findMany();
      expect(redemptions).toHaveLength(1);
      expect(redemptions[0].orderId).toBe(order.body.data.id);
    });

    it('snapshots the shipping address so later profile edits cannot rewrite history', async () => {
      await addToCart();
      const order = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS, saveAddress: true })
        .expect(201);

      const saved = await prisma.address.findFirst({ where: { userId: fixtures.customer.id } });
      await prisma.address.update({
        where: { id: saved!.id },
        data: { line1: 'Completely different street' },
      });

      const stored = await prisma.order.findUnique({ where: { id: order.body.data.id } });
      expect((stored!.shippingAddress as any).line1).toBe('1 Test Street');
    });
  });

  // -------------------------------------------------------------- webhooks

  describe('payment webhooks', () => {
    it('rejects a webhook with an invalid signature', async () => {
      await request(server())
        .post(`${API}/webhooks/razorpay`)
        .set('x-razorpay-signature', 'invalid')
        .send({ event: 'payment.captured', payload: {} })
        .expect(403);
    });

    it('rejects a webhook with no signature header', async () => {
      await request(server())
        .post(`${API}/webhooks/razorpay`)
        .send({ event: 'payment.captured', payload: {} })
        .expect(400);
    });

    it('settles an order from a genuine webhook and ignores replays', async () => {
      await request(server())
        .post(`${API}/cart/items`)
        .set(auth())
        .send({ variantId: fixtures.variant.id, quantity: 2 })
        .expect(201);
      const order = await request(server())
        .post(`${API}/orders`)
        .set(auth())
        .send({ shippingAddress: ADDRESS })
        .expect(201);
      const intent = await request(server())
        .post(`${API}/payments/intent`)
        .set(auth())
        .send({ orderId: order.body.data.id })
        .expect(201);

      const event = {
        id: 'evt_webhook_1',
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook_1',
              order_id: intent.body.data.providerOrderId,
              amount: 210000,
              method: 'upi',
            },
          },
        },
      };
      const raw = JSON.stringify(event);
      const signature = mockProvider.signWebhook(raw);

      await request(server())
        .post(`${API}/webhooks/razorpay`)
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(200);

      const settled = await prisma.order.findUnique({ where: { id: order.body.data.id } });
      expect(settled!.paymentStatus).toBe('CAPTURED');

      // Gateways retry; the same delivery must not double-decrement stock.
      await request(server())
        .post(`${API}/webhooks/razorpay`)
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(200);

      const inventory = await prisma.inventory.findUnique({
        where: { variantId: fixtures.variant.id },
      });
      expect(inventory!.quantity).toBe(8);

      const events = await prisma.paymentWebhookEvent.findMany();
      expect(events).toHaveLength(1);
    });
  });
});
