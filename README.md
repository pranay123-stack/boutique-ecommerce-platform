# Boutique Commerce

A production e-commerce platform for a boutique retailer — full storefront,
business console, payments, shipping and fulfilment.

Next.js 15 · NestJS 11 · PostgreSQL 16 · Prisma · Redis · TypeScript

---

## What it does

**Customers** browse a faceted catalogue with typo-tolerant search, configure
product variants, keep a cart across devices, apply discount codes, check out as
a guest or a member, pay securely, and track their order to delivery.

**The business** manages the catalogue and stock, processes and ships orders,
issues refunds, runs promotions, moderates reviews, edits the homepage, and
reads live revenue analytics — all from an admin console with role-based access.

```
Storefront   http://localhost:3100
API          http://localhost:4100/api/v1
API docs     http://localhost:4100/api/v1/docs
```

---

## Quick start

### Docker

```bash
cp .env.example .env
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 48)"  >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 48)" >> .env

docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run db:seed:prod
```

### Local

```bash
npm run dev:infra        # Postgres, Redis and MailHog in Docker
npm run install:all
npm run db:migrate
npm run db:seed
npm run dev              # API and storefront together
```

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@boutique.local` | `Admin@12345` |
| Manager | `manager@boutique.local` | `Manager@12345` |
| Customer | `customer@boutique.local` | `Customer@12345` |

The seed loads 12 products (57 variants), a category tree, coupons, homepage
banners and 26 historical orders so the analytics dashboard has real numbers.

### Product imagery

There is **no real photography in this repository** — a boutique supplies its
own, and bundling stock photos would mean licensing this project does not have.
The seed can source images four ways, via `SEED_IMAGE_SOURCE`:

| Source | Keyword-matched | Licence | Key | Issued |
|--------|-----------------|---------|-----|--------|
| `generated` *(default)* | n/a — draws the product type | none required | no | — |
| `picsum` | **no** — subject is arbitrary | Unsplash License | no | — |
| `pexels` | **yes** | Pexels License | free | **instantly** |
| `unsplash` | **yes** | Unsplash License | free | after review, 5–10 business days |

**`generated`** draws an SVG per product: a palette gradient plus a silhouette of
the actual product type (dress, scarf, mug, bag…). Deterministic, ~1 KB, works
offline.

**`picsum`** downloads real photography, but the subject is unrelated to the
product — in testing it put a lake on a crossbody bag and a laptop on a
stoneware mug. Real, but it reads as broken data.

**`pexels`** and **`unsplash`** are the ones that actually look like a store.
Pexels issues a key immediately; Unsplash reviews applications first, so reach
for Pexels when you need photography today.

```bash
SEED_IMAGE_SOURCE=pexels   PEXELS_API_KEY=your_key      npm run db:seed
SEED_IMAGE_SOURCE=unsplash UNSPLASH_ACCESS_KEY=your_key npm run db:seed
```

Each product carries a `photoQuery` in `prisma/seed-data.ts` ("silk scarf
folded", "handmade ceramic mug") used as the search term. Gallery slots take
*different* results for the same query, so a product's three images are three
photographs rather than one repeated.

#### Attribution is not optional

Both providers require the photographer to be credited wherever their work
appears, and Unsplash additionally requires a ping to its `download_location`
endpoint whenever a photo is used — that counter is how photographers show
reach and get hired. The seed does both, and writes what it used to
`uploads/image-credits.json`.

The storefront renders those credits under the product gallery and on
`/credits`, served from `GET /api/v1/content/image-credits`. When the merchant's
own photographs replace the placeholders the sidecar disappears, the endpoint
returns `{}` and the credit lines stop rendering — no cleanup needed.

> **Stock photography is for the demo only.** Shipping a photo of *a* silk
> scarf as *the* scarf a customer is buying is misrepresentation, not a
> licensing question — and it is the exact `NOT_AS_DESCRIBED` return reason
> this platform implements. The client supplies real product photography before
> launch.

> LoremFlickr was evaluated and rejected: it returns `cc-nc` (NonCommercial)
> images with the licence badge and photographer credit burned into the pixels,
> which cannot be used on a storefront.

Whichever source is used, bytes are downloaded once and stored locally, so the
demo works offline afterwards. Any failure falls back to `generated` rather than
leaving a product with no image, and the seed reports what happened
(`Photos: 50/50 downloaded`).

To use your own photographs: upload via the admin console (*Products → edit*),
`POST /api/v1/admin/uploads/image` for bulk import, or set `STORAGE_DRIVER=s3`
with `STORAGE_PUBLIC_BASE_URL` pointed at your CDN.

---

## Project structure

```
├── frontend/        Next.js 15 storefront + admin console
│   └── src/
│       ├── app/         App Router pages (storefront, account, admin)
│       ├── components/  UI kit, product, cart, checkout, admin
│       ├── hooks/       React Query data hooks
│       ├── lib/         API client, formatting
│       └── store/       Zustand client state
├── backend/         NestJS API
│   ├── prisma/          schema, migrations, seed
│   └── src/
│       ├── common/      guards, filters, interceptors, decorators, utils
│       ├── config/      typed configuration + fail-fast validation
│       └── modules/     auth, products, cart, orders, payments, shipping …
├── database/        ERD, index strategy, tuning SQL, backup scripts
├── docker/          production Dockerfiles
├── tests/           Playwright end-to-end suite
├── docs/            API, architecture, security, deployment, testing
└── .github/         CI/CD pipeline
```

---

## Documentation

| Document | Contents |
|----------|----------|
| [docs/API.md](docs/API.md) | 122 endpoints, auth model, error codes, checkout flow |
| [docs/COMPLIANCE.md](docs/COMPLIANCE.md) | GST, tax invoicing, cash on delivery and returns |
| [docs/GO-LIVE.md](docs/GO-LIVE.md) | What the merchant must supply before taking real money |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and the reasoning behind it |
| [docs/SECURITY.md](docs/SECURITY.md) | Controls implemented, threats addressed, pre-launch checklist |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Docker and Railway deployment, releases, gateway setup |
| [docs/TESTING.md](docs/TESTING.md) | Test strategy and the bugs it caught |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Measurements at 100k products and the optimisation found |
| [database/README.md](database/README.md) | Schema design, indexing, concurrency |
| [database/design/ERD.md](database/design/ERD.md) | Entity diagram and table reference |

---

## Commands

```bash
npm run dev              # API + storefront, hot reload
npm run build            # build both
npm run verify           # lint + typecheck + every test + build

npm run test             # unit + component
npm run test:all         # unit + integration + component + end-to-end
npm run test:e2e         # Playwright only

npm run db:migrate       # apply migrations (production-safe)
npm run db:seed          # load demo data
npm run db:studio        # browse data in Prisma Studio
npm run db:reset         # drop, migrate, seed (development only)

npm run docker:up        # full containerised stack
npm run audit            # dependency vulnerability audit
npm run docs:api         # regenerate docs/API.md from the live spec
```

---

## Engineering notes

A few decisions that shaped the codebase:

**Money never touches a float.** Stored as `DECIMAL(12,2)`, computed with
`Prisma.Decimal`, converted to gateway minor units only at the payment adapter
boundary. Basket discounts are allocated proportionally across lines with the
last line absorbing the rounding remainder, so the parts sum exactly to the
whole.

**Cart, checkout and orders price through the same service.** Duplicating that
arithmetic is how a storefront ends up charging a different number than it
displayed.

**Stock cannot be oversold.** Every mutation is a single conditional `UPDATE`
whose `WHERE` clause encodes the invariant, so the check and the write cannot be
separated by a concurrent transaction. An integration test races two checkouts
at the last unit and asserts exactly one wins.

**Payment status is never taken from the client.** The amount comes from the
database; the signature is verified in constant time; the payment is re-read
from the gateway; the amount is compared. Webhooks are the authoritative signal
and are idempotent through a database unique constraint, with a reconciliation
job for deliveries that never arrive.

**Orders are immutable snapshots.** Addresses and line items are copied at
purchase time, so editing a saved address or repricing a product can never
rewrite financial history.

**Redis is a performance layer, never a correctness dependency.** Every cache
call degrades to a miss when it is unavailable — the store gets slower, not
broken.

**Mock providers are not stubs.** The offline payment gateway computes and
verifies the same HMAC-SHA256 signatures as the live adapter, so the
security-critical path is tested exactly as it runs in production.

---

## Testing

230 automated tests: 72 unit, 112 integration, 23 component, 23 end-to-end.

The suite found ten real defects during development — including a
misconfiguration that capped the entire API at 10 requests per minute, and a
unique constraint that would have let each customer place exactly one order.
Every one has a regression test. See [docs/TESTING.md](docs/TESTING.md).

---

## Status

Runs locally end to end: browse, search, cart, coupon, guest and member
checkout, payment verification, order tracking, fulfilment, refunds, reviews
and analytics all work against a real database.

Notifications ship with three channels. Email uses SMTP (nodemailer). SMS
supports Twilio and MSG91; WhatsApp uses the Meta Cloud API. All three default
to `mock`, which logs instead of sending, so nothing reaches a real inbox in
development.

Production launch still needs infrastructure rather than code — TLS, live
gateway credentials, a secret manager, and an independent penetration test.
That list is in [docs/SECURITY.md](docs/SECURITY.md#before-going-live).
