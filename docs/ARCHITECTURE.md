# Architecture

## System shape

```
                    ┌──────────────────────────────────────┐
   Browser ────────►│  Next.js 15 storefront (App Router)  │
                    │  SSR/ISR pages · React Query · Zustand│
                    └──────────────┬───────────────────────┘
                                   │ /api/proxy/*  (same-origin rewrite,
                                   │                keeps auth cookies first-party)
                    ┌──────────────▼───────────────────────┐
                    │  NestJS API (modular monolith)       │
                    │  guards · pipes · interceptors       │
                    ├──────────────────────────────────────┤
                    │ auth  catalog  cart  orders  payments│
                    │ shipping  inventory  coupons  admin  │
                    └───┬─────────────┬────────────┬───────┘
                        │             │            │
              ┌─────────▼───┐  ┌──────▼─────┐  ┌───▼─────────────┐
              │ PostgreSQL  │  │   Redis    │  │ Provider        │
              │ 16 · Prisma │  │ cache +    │  │ adapters        │
              │ FTS + trgm  │  │ BullMQ     │  │ Razorpay ·      │
              └─────────────┘  └────────────┘  │ Shiprocket ·    │
                                               │ SMTP · S3       │
                                               └─────────────────┘
```

## Why a modular monolith

A boutique retailer needs correct orders and fast pages, not a distributed
system. Microservices would introduce network partitions between *reserve
stock* and *create order* — two operations that must be atomic. Here they are
one database transaction.

Each domain is a self-contained NestJS module with its own controller, service,
DTOs and tests. Modules communicate through injected services or domain events,
never by reaching into each other's tables. If a module ever needs to become a
service, its boundary is already drawn.

## Request pipeline

```
Request
  ├─ helmet                     security headers, CSP in production
  ├─ CORS                       explicit allow-list, credentials enabled
  ├─ cookie-parser              signed cookies
  ├─ compression                gzip
  ├─ json({ verify })           preserves rawBody for webhook signatures
  ├─ ThrottlerGuard             one global limiter, tightened per auth route
  ├─ JwtAuthGuard               protected by default; @Public() opts out
  ├─ RolesGuard                 role and permission checks
  ├─ ValidationPipe             whitelist + forbidNonWhitelisted + transform
  ├─ » Controller » Service » Prisma
  ├─ TransformInterceptor       { success, data, meta } envelope
  ├─ AuditInterceptor           records @Audit() routes, secrets redacted
  └─ AllExceptionsFilter        stable error shape; internals never leak
```

Two deliberate defaults:

- **Routes are authenticated unless marked `@Public()`.** Forgetting a
  decorator produces a 401, not an information disclosure.
- **Unknown request properties are rejected**, not silently dropped, so a
  client sending `roleId` during registration gets a 400 rather than a
  privilege escalation attempt that quietly no-ops.

## Layering

| Layer | Responsibility | Depends on |
|-------|---------------|------------|
| Controller | HTTP shape, status codes, Swagger | Service |
| Service | Business rules, transactions | Prisma, other services |
| Adapter | Third-party integrations behind an interface | HTTP |
| Prisma | Data access, migrations | PostgreSQL |

Controllers hold no business logic. Services never touch `req`/`res`.

## Provider abstraction

Payments, shipping and storage sit behind interfaces (`IPaymentProvider`,
`IShippingProvider`, `IStorageProvider`) resolved by a factory at boot:

```ts
{
  provide: PAYMENT_PROVIDER,
  useFactory: (config, razorpay, mock) => {
    if (config.get('payment.mode') === 'mock') {
      if (isProduction) throw new Error('mock gateway is not permitted in production');
      return mock;
    }
    return razorpay;   // adding Stripe = one class + one case
  },
}
```

The mock adapters are not stubs that return `true`. They compute and verify the
same HMAC-SHA256 signatures as the live gateway, so the security-critical path
is exercised identically in development, CI and production — only the network
call is replaced. The mock gateway refuses to load when `NODE_ENV=production`.

## Money and correctness

- Stored as `DECIMAL(12,2)`; arithmetic via `Prisma.Decimal`.
- Converted to gateway minor units only inside the payment adapter.
- Cart preview, checkout and order creation all price through the **same**
  `PricingService`. Duplicating that arithmetic is how a storefront ends up
  charging a different number than it displayed.
- Basket-level discounts are allocated across lines in proportion to value, with
  the final line absorbing the rounding remainder so the allocation sums exactly.
- **Prices are GST-inclusive.** An item advertised at ₹2,450 is charged at
  ₹2,450, with the tax backed out of that figure rather than added at checkout.
  The reverse would overcharge every customer by the tax rate.

## Tax and compliance

`TaxModule` is global and owns one question: what tax applies to this line, and
under which heads. `PricingService` asks it; nothing else computes tax.

- Comparing the seller's state with the delivery state decides intra-state
  (CGST + SGST) versus inter-state (IGST). Never both — enforced in code and by
  a database CHECK constraint.
- Delivery and COD handling are ancillary supplies, so they take the principal
  supply's rate rather than one of their own.
- Order and order-line rows carry a **GST snapshot**: rate, HSN, taxable value
  and each head's amount, frozen at order time. Rates change and registrations
  lapse; an issued invoice must never restate itself.
- Invoice numbers are gapless per financial year, serialised by a
  transaction-scoped advisory lock rather than a Postgres sequence — sequences
  leak numbers on rollback, and a gap in an invoice series is a compliance
  problem.

See [COMPLIANCE.md](COMPLIANCE.md) for the full treatment.

## Returns

Returns are modelled separately from refunds, because they are not the same
event: a return can fail inspection and never produce a refund, and a refund can
be issued without a return. Restocking happens at **inspection**, never at
receipt — an item that comes back damaged must not be sold again, and until
someone has looked at it, nobody knows which it is.

## Payment integrity

The amount charged is read from the database, never from the request body.
Before an order is marked paid, three independent checks must pass:

1. **Signature** — HMAC-SHA256 over `order_id|payment_id`, compared in constant
   time.
2. **Read-back** — the payment is re-fetched from the gateway; the client's
   claim of success is not sufficient.
3. **Amount** — the gateway's amount must equal the stored order total.

Webhooks are the authoritative settlement signal, because the customer's
browser can close before the callback fires. They are idempotent via a
`UNIQUE(provider, eventId)` constraint — the database makes replay a no-op
rather than a race in application code. A reconciliation job re-reads stale
pending payments every 10 minutes to catch deliveries that never arrived.

## Concurrency

Stock is the contended resource. Every mutation is one conditional `UPDATE`
whose `WHERE` clause encodes the invariant, so the check and the write cannot be
separated by another transaction:

```sql
UPDATE inventory
SET "reservedQuantity" = "reservedQuantity" + $2
WHERE "variantId" = $1 AND quantity - "reservedQuantity" >= $2;
```

Order creation wraps pricing, reservation, order write, coupon redemption and
cart conversion in a single transaction — there is no state where stock is held
but no order exists.

## Caching

Redis is a **performance layer, never a correctness dependency**. Every cache
method degrades to a miss when Redis is unavailable; the storefront gets slower,
not broken. Invalidation is explicit: any stock movement, catalogue write or
review change drops the affected product detail, listing and homepage keys.

Pattern deletes use `SCAN`, never `KEYS`, which would block the Redis event loop.

## Background work

BullMQ on Redis handles notification delivery, so checkout latency and success
never depend on an SMTP server's mood. Scheduled jobs (`@nestjs/schedule`) each
take a short-lived Redis lock, so running several API instances does not mean
running each job several times — a duplicated reconciliation pass could
double-settle an order.

| Job | Cadence | Purpose |
|-----|---------|---------|
| Payment reconciliation | 10 min | Settle payments whose callback was lost |
| Webhook retry | 30 min | Re-process events that previously threw |
| Tracking sync | hourly | Pull carrier scans into our own timeline |
| Expire stale orders | 10 min | Release stock held by abandoned checkouts |
| Cleanup | daily 03:00 | Purge expired tokens and guest carts |

## Frontend

- **Server Components** render the homepage, product detail and category pages
  for SEO and fast first paint; a dead API degrades to a usable page rather than
  a 500.
- **React Query** owns server state (caching, refetch, optimistic updates).
  **Zustand** owns only genuine client state — auth profile and UI toggles.
- **Filter state lives in the URL**, so every filtered view is shareable,
  bookmarkable and restorable with the back button.
- The access token is held in memory/`sessionStorage`; the refresh token is an
  `httpOnly` cookie JavaScript cannot read. That bounds the blast radius of an
  XSS bug to 15 minutes rather than 30 days.
