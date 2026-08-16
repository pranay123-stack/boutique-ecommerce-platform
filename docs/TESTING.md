# Testing

The integration suite runs against an isolated `boutique_test` database.
`npm run db:migrate` only touches the development database, so create it once
(idempotent, and already wired into `npm run setup` and `test:backend:e2e`):

```bash
npm run db:setup:test
```

```bash
npm run test:backend        # unit — fast, no I/O
npm run test:backend:e2e    # integration — real Postgres + Redis
npm run test:frontend       # component — Vitest + Testing Library
npm run test:e2e            # end-to-end — Playwright against the running stack
npm run test:all            # everything
npm run verify              # lint + typecheck + all tests + build
```

## The pyramid

| Layer | Tool | Count | What it protects |
|-------|------|-------|------------------|
| Unit | Jest | 72 | Money arithmetic, discount allocation, coupon rules, signature verification, RBAC, throttler config |
| Integration | Jest + Supertest | 112 | Real HTTP against a real database: auth lifecycle, cart, checkout, payments, webhooks, admin RBAC |
| Component | Vitest + RTL | 23 | Rendering, formatting, interaction, accessible names |
| End-to-end | Playwright | 23 | Complete customer and admin journeys in a real browser, desktop and mobile |

**230 automated tests.**

## What is deliberately covered

**Money.** `0.1 + 0.2` is asserted to equal `0.3` exactly. Discount allocation
across lines is asserted to sum back to the discount to the cent, including the
case that cannot divide evenly (10.00 across three equal lines).

**Payment integrity.** Forged signatures, signatures bound to a different
payment, empty signatures, and tampered webhook bodies are each asserted to be
rejected. A genuine signature is asserted to settle the order, and a replay of
it is asserted to be a no-op that does not decrement stock twice.

**Oversell under concurrency.** Two checkouts fire simultaneously at a single
remaining unit; the test asserts exactly one succeeds and that inventory ends
consistent.

**Authorisation.** Every admin route is asserted to return 403 for a CUSTOMER
and 401 for an anonymous caller. A suspended account's existing token is
asserted to stop working immediately.

**Refresh token theft.** Replaying a rotated refresh token is asserted to
revoke the entire family, including the legitimately rotated token.

## Mock providers are not stubs

The mock payment gateway computes and verifies the same HMAC-SHA256 signatures
as the live Razorpay adapter. The signature-verification path — the
security-critical part — is exercised by the test suite exactly as it runs in
production. Only the network call is replaced.

## Test isolation

Integration tests truncate every table **and flush the Redis cache** before each
test. Cached product listings outlive a `TRUNCATE`; without the flush, state
leaks between tests and failures appear unrelated to their cause.

Rate limiting is disabled only under `NODE_ENV=test`, because per-route
`@Throttle` decorators set hard numeric limits no environment variable can
raise — the suite would otherwise trip its own limiter.

## End-to-end sessions

Playwright authenticates once in a setup project and reuses the state. Two
product behaviours make the usual `storageState` recipe insufficient, and both
are correct behaviours we did not weaken:

1. `/auth/login` is rate limited, so logging in per test trips a real control.
2. Refresh tokens rotate and reuse revokes the family — restoring the same
   cookie into several contexts looks exactly like token theft.

So the setup also captures the short-lived access token and replays it into
`sessionStorage`, meaning restored contexts never need to refresh.

## Compliance suites

The GST, invoicing, COD and returns paths have their own layers, because these
are the ones that decide whether the business can legally take money.

| Suite | Checks | Covers |
|---|---|---|
| `backend/src/modules/tax/gst.service.spec.ts` | 13 | Inclusive vs exclusive maths, place of supply, `CGST == SGST` across 30 amount/rate combinations |
| `backend/src/modules/tax/hsn-catalogue.spec.ts` | 5 | Price-threshold apparel rates, only statutory slabs ever produced |
| `backend/src/modules/invoices/financial-year.spec.ts` | 7 | Financial-year boundaries, century roll, amount-in-words in lakh/crore |
| `backend/src/modules/returns/returns.service.spec.ts` | 8 | Lifecycle graph: no reopening a settled return, refund only after inspection, no unreachable status |
| `tests/functional/gst-cod-invoice-returns.py` | 71 | Full sweep against a running API, end to end |
| `tests/e2e/compliance.spec.ts` | 12 | Policy pages, sitemap, robots, contact form, GST display, a COD checkout through the browser |

Two of those deserve singling out.

**Gapless invoice numbering under concurrency.** GST requires an unbroken
sequence, and the place it breaks is two checkouts reading the same
`MAX(sequence)`. The functional suite fires 12 simultaneous COD checkouts and
asserts unique, gapless numbers; a manual run at 20 concurrent gave 20 invoices
with zero duplicates and zero gaps.

**A return driven to restock.** The suite walks an order to `DELIVERED`,
opens a return, refuses a second concurrent one, refuses returning more units
than were ordered, moves it through approval and receipt, records an
inspection, and then asserts the stock level actually went back up — rather
than assuming the code that was supposed to do it did.

## Bugs this suite caught

Testing was not a formality; it found real defects, including:

| Bug | Impact | Caught by |
|-----|--------|-----------|
| Second named throttler applied globally | **Entire API capped at 10 req/min** | E2E |
| `carts.userId` globally unique | Customers could place **only one order, ever** | Integration |
| `forbidNonWhitelisted` vs. extra query params | **Every admin filter returned 400** | Integration |
| Product cache not invalidated on stock change | Sold-out items still advertised as in stock | Smoke |
| Optional-auth guard not awaited | Cart/checkout ignored a valid token | Smoke |
| Checkout empty-cart guard raced the redirect | Customers bounced to `/cart` after paying | E2E |
| Payment mode inferred from key substring | Live gateway widget rendered in mock mode | E2E |
| Guest payment intent missing email | **Guest checkout impossible** (403) | E2E |
| Stale order cache after payment | Confirmation page showed an unpaid order | E2E |
| Unassociated form labels | Variant fields invisible to screen readers | E2E |
| `public/robots.txt` shadowed the generated route | Sitemap reference and staging no-index guard never shipped | E2E |
| Sitemap fetched `/categories`, which does not exist | **Every category page missing from search** — the failure only logged | E2E |
| ISR pages prerendered against an unreachable API | Freshly deployed shop answered "catalogue unavailable" | E2E |
| Cancel unwound stock by `paymentStatus` | A cancelled COD order would corrupt inventory counts | Design review during COD work |
| Invoice issued asynchronously | "Download invoice" 404'd right after checkout | Functional |
| Two paths could both issue an invoice | Race burned a number and broke the gapless sequence | Functional |
| `classify()` spread into Prisma `create` | Admin product creation returned 500 | Functional |
| Admin could not set an HSN code | Every merchant-added product taxed at the 18% catch-all | Functional |
| Throttler spec opened a real Redis socket | **Whole unit suite hung**; 117 tests now run in under a second | Isolating a hang |

Each has a regression test.
