# Database

PostgreSQL 16 · Prisma ORM · **37 tables · 133 indexes · 46 foreign keys · 22 check constraints**

The canonical schema lives at [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma)
— that is where Prisma's tooling expects it, and keeping it there means
`prisma migrate`, `generate` and `studio` all work without path gymnastics.
This directory holds the database *engineering* material: design rationale,
tuning SQL, and operational scripts.

```
database/
├── README.md          this file — schema design and rationale
├── design/ERD.md      entity relationship diagram and table reference
├── sql/init/          extensions created before the first migration
├── sql/tuning.sql     analysis queries for index health and slow paths
└── scripts/           backup and restore helpers
```

---

## Design principles

### 1. Money is never a float

Every monetary column is `DECIMAL(12,2)`. Application arithmetic goes through
`Prisma.Decimal` (decimal.js). Conversion to gateway minor units (paise) happens
**only** at the payment adapter boundary.

`0.1 + 0.2 !== 0.3` in binary floating point. On an order total that is a
customer-visible defect and an accounting one.

### 2. Financial records are immutable snapshots

`orders.shippingAddress` and `orders.billingAddress` are JSON snapshots, not
foreign keys. `order_items` copies the SKU, product name, variant name, image
and unit price at the moment of purchase.

A customer editing their saved address must never silently rewrite where a
past order was delivered, and a price change must never restate historical
revenue. Catalogue rows are soft-deleted (`deletedAt`) for the same reason:
`order_items.productId` uses `ON DELETE SET NULL`, so history survives even if
a product is purged.

### 3. Constraints live in the database, not only in the application

Application validation can be bypassed by a bad migration, a console session,
or a second service. 22 `CHECK` constraints encode the invariants that must
hold regardless:

| Constraint | Invariant |
|-----------|-----------|
| `inventory_reserved_lte_quantity` | Reservations can never exceed stock on hand |
| `inventory_quantity_non_negative` | Stock cannot go negative |
| `variants_discount_lte_price` | A discount price cannot exceed the list price |
| `payments_refund_lte_amount` | Cumulative refunds cannot exceed the captured amount |
| `orders_identity_present` | Every order has either a `userId` or a `guestEmail` |
| `coupons_percentage_max_100` | A percentage coupon cannot exceed 100% |
| `reviews_rating_range` | Ratings are 1–5 |
| `coupons_window_valid` | Expiry must be after the start date |

### 4. Uniqueness is scoped to what is actually unique

`carts.userId` is **not** globally unique. A customer accumulates one cart per
completed order, so a plain unique constraint meant the `CONVERTED` cart kept
owning the slot and the customer could never add to a cart again — they could
buy exactly once, ever.

What is actually true is *one **active** cart per user*, which is a partial
unique index:

```sql
CREATE UNIQUE INDEX carts_active_user_uniq
    ON carts("userId")
    WHERE status = 'ACTIVE' AND "userId" IS NOT NULL;
```

The same applies to `sessionId` for guests.

> **NULLs and uniqueness.** Postgres treats `NULL`s as distinct in unique
> indexes, so `UNIQUE(wishlistId, productId, variantId)` does *not* prevent
> duplicate rows when `variantId IS NULL`. `WishlistService.add` therefore
> performs an explicit lookup rather than relying on an upsert.

---

## Search

Product search is Postgres-native — no external search service to operate,
back up, or keep in sync.

**Weighted full-text.** `products.searchVector` is a `GENERATED ALWAYS AS …
STORED` `tsvector`, so it can never fall out of sync with the row:

```sql
setweight(to_tsvector('english', coalesce(name, '')),             'A') ||
setweight(to_tsvector('english', coalesce(brand, '')),            'B') ||
setweight(to_tsvector('english', coalesce("shortDescription",'')),'C') ||
setweight(to_tsvector('english', coalesce(description, '')),      'D')
```

A GIN index (`products_search_vector_gin`) serves it, and results are ranked
with `ts_rank`, so a name match outranks a description match.

**Typo tolerance.** A trigram GIN index (`products_name_trgm`) backs the `<%`
word-similarity operator. Whole-string `similarity()` is too blunt here —
`"scrf"` scores 0.09 against *"Hand-Rolled Mulberry Silk Scarf"* but 0.40
word-wise — so the search query lowers the threshold for its statement only:

```sql
SET LOCAL pg_trgm.word_similarity_threshold = 0.35;
```

`SET LOCAL` keeps the change inside the transaction and the `<%` operator stays
index-accelerated.

---

## Index strategy

**Partial indexes for hot paths.** The storefront only ever reads live
products, so the index that serves it only contains live rows — smaller index,
smaller cache footprint, faster scans:

```sql
CREATE INDEX products_live_created_idx ON products("createdAt" DESC)
    WHERE status = 'ACTIVE' AND "deletedAt" IS NULL;
```

The same technique bounds the low-stock alert query, the notification worker's
poll, and the webhook retry queue — each touches only unfinished rows.

**Composite ordering matches query shape.** `orders(userId, createdAt DESC)`
serves "my orders, newest first" as a single index scan.

**Stable pagination.** Every sort appends `id` as a tiebreaker. Without it,
rows with identical timestamps can appear on two consecutive pages or on
neither.

---

## Concurrency: preventing oversell

Two shoppers racing for the last unit must not both succeed. Read-then-write in
application code is a lost-update bug no matter how tight the window looks.

Every stock mutation is a single conditional `UPDATE` whose `WHERE` clause
encodes the invariant. Postgres takes a row lock for the duration, so the check
and the write cannot be separated by another transaction:

```sql
UPDATE inventory
SET "reservedQuantity" = "reservedQuantity" + $2
WHERE "variantId" = $1
  AND quantity - "reservedQuantity" >= $2;   -- 0 rows ⇒ insufficient stock
```

Stock moves through three states: **reserved** at order creation, **committed**
when payment is confirmed, **released** if payment fails or the order is
cancelled. Reserved units stay in `quantity` but are excluded from what the
storefront can sell.

This is covered by an integration test that fires two concurrent checkouts at a
single remaining unit and asserts exactly one succeeds.

---

## Migrations

```bash
npm run db:migrate          # apply pending migrations (production-safe)
npm run db:migrate:dev      # create a new migration from schema changes
npm run db:seed             # load roles, demo catalogue and historical orders
npm run db:reset            # drop, re-migrate and re-seed (development only)
```

Migrations that need SQL Prisma cannot express — generated columns, partial
unique indexes, GIN indexes, check constraints — are authored with
`prisma migrate dev --create-only` and then edited before being applied.

**Never** run `migrate dev` against production; it may reset the database.
Deployments use `migrate deploy`, which only applies pending migrations.

---

## Operations

```bash
./scripts/backup.sh                    # timestamped compressed dump
./scripts/restore.sh backups/xyz.sql.gz
psql "$DATABASE_URL" -f sql/tuning.sql # index health, unused indexes, bloat
```

### Scaling notes

Sized for the 100k-product target:

- `connection_limit` in `DATABASE_URL` should be
  `(max_connections / app instances) - headroom`. Add PgBouncer in transaction
  mode past ~4 instances.
- `audit_logs`, `inventory_history` and `notifications` grow without bound.
  They are already indexed on `createdAt`; partition by month once any exceeds
  ~50M rows.
- Read replicas: analytics queries (`/admin/analytics/*`) are the natural first
  candidates to route away from the primary.
