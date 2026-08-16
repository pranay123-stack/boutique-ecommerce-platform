# Performance

Measured on the target catalogue size the brief specifies — **100,000 products,
100,000 variants, 100,000 inventory rows** — loaded into the development
database and queried through the running API.

## Measured results at 100k products

| Endpoint | Cold (cache flushed) | Warm |
|----------|---------------------:|-----:|
| `GET /products?limit=12` | 53 ms | 4 ms |
| `GET /products?limit=12&sort=price_asc` | 37 ms | 3 ms |
| `GET /products?q=cashmere sweater` | 202 ms | 3 ms |
| `GET /products?minPrice=1000&maxPrice=2000&brands=…` | 17 ms | 5 ms |
| `GET /products/facets` | 54 ms | 3 ms |
| `GET /content/homepage` | 34 ms | 4 ms |

Deep pagination stays flat — page 1: 48 ms, page 100: 39 ms, page 1000: 45 ms,
page 5000: 78 ms.

## Query plans at 100k rows

Confirmed with `EXPLAIN ANALYZE` against the loaded dataset:

```
-- Storefront listing
Limit  (actual time=0.044..0.061 rows=12)
  ->  Index Scan using products_live_created_idx on products
Execution Time: 0.101 ms

-- Price-filtered browse
Limit  (actual time=0.036..0.094 rows=12)
  ->  Index Scan using products_status_basePrice_idx on products
      Index Cond: (status = 'ACTIVE' AND basePrice >= 1000 AND basePrice <= 2000)

-- Selective full-text search
Bitmap Heap Scan on products  (actual time=4.726..4.728 rows=1)
  ->  Bitmap Index Scan on products_search_vector_gin
```

The partial indexes are doing exactly what they were designed for: the
storefront's listing query touches an index containing only live products.

> On a very common search term the planner chooses a sequential scan and exits
> early once `LIMIT` is satisfied — that is the correct choice, not a missing
> index. The GIN index wins on selective terms, as the plan above shows.

## Optimisation found by this exercise

`GET /products/facets` was **726 ms cold / 654 ms warm** at 100k products.

The original implementation selected every matching product into Node and
passed the resulting id array into the attribute-count query — so a 100k-product
catalogue meant materialising 100k ids per request, and the response was slow
even on a cache hit because the endpoint was not cached at all.

Rewritten to aggregate in Postgres (`groupBy` for brands, `aggregate` for the
price range, and a join straight from the attribute tables for option counts,
with no id list crossing the process boundary) and to use the read-through
cache:

| | Before | After | Improvement |
|---|-------:|------:|------------:|
| Cold | 726 ms | 54 ms | **13×** |
| Warm | 654 ms | 3 ms | **218×** |

Facet counts were verified unchanged (brands summing to the full catalogue, and
category-scoped facets narrowing correctly).

## Where the speed comes from

**Partial indexes.** The storefront only reads live products, so the indexes
serving it contain only live rows — a smaller index, a smaller cache footprint,
and fewer pages touched per query.

**Generated `tsvector` column.** Search weights are precomputed and stored, so
ranking costs nothing at query time and the column can never drift from the row.

**Read-through cache with explicit invalidation.** Product listings, detail
pages, the category tree and the homepage are cached in Redis. Any stock
movement, catalogue write or review change drops exactly the affected keys —
which is what keeps a sold-out item from continuing to advertise itself as in
stock.

**Aggregate in the database.** Counting, grouping and ranking happen where the
data is. The API returns rows, not working sets.

**Narrow selects.** Listing responses select only the fields a product card
renders, rather than whole rows with relations.

**Stable pagination.** Every sort appends `id` as a tiebreaker, so paging never
repeats or skips a row when timestamps collide.

## Frontend

Production build: **102 kB shared JS**, first load 119–177 kB per route.

- Homepage, product detail and category pages are Server Components with ISR
  (120–300 s), so first paint does not wait on client JavaScript.
- Images use `next/image` with AVIF/WebP, responsive `sizes`, and `priority`
  only on the first row — everything below the fold is lazy.
- `keepPreviousData` keeps the previous page rendered while the next loads, so
  changing a filter never flashes an empty grid.
- Skeletons preserve layout, avoiding cumulative layout shift.

## Scaling beyond this

The measurements above are single-instance. Next steps, in the order they would
matter:

1. **PgBouncer** in transaction mode past ~4 API instances.
2. **Read replicas** for `/admin/analytics/*`, the natural first workload to
   move off the primary.
3. **CDN** in front of product images and static assets.
4. **Partition** `audit_logs`, `inventory_history` and `notifications` by month
   once any exceeds ~50M rows.
5. **Redis-backed throttler storage** so rate limits are shared across
   instances rather than per-process.

---

## Storefront rendering: ISR vs per-request

The homepage is cached with ISR (`revalidate = 120`) rather than rendered per
request. That is not a default anyone picked — it was measured after a
correctness fix forced the question.

**The problem.** `next build` runs inside the Docker image with no reachable
API, so every ISR page was prerendered from a failed fetch. The image shipped a
snapshot of an empty storefront, and a freshly deployed container served "our
catalogue is briefly unavailable" until the first background regeneration
completed — a broken-looking shop after every deploy.

**The obvious fix was worse than the bug.** Switching the homepage to
`dynamic = 'force-dynamic'` fixed correctness and destroyed throughput:

| Rendering | Throughput | p50 latency |
|---|---:|---:|
| `force-dynamic` (no fetch cache) | 33 req/s | 1,571 ms |
| `force-dynamic` + `fetchCache: 'default-cache'` | 27 req/s | 1,640 ms |
| ISR, warmed (shipped) | **379 req/s** | **127 ms** |

The second row is the informative one. Re-enabling the data cache changed
almost nothing, which rules out the API round trip as the cost: it is the React
render of 20+ product cards. A page that expensive has to be cached.

**What shipped instead.** Keep ISR, and warm the cache at container start
before the container is ever marked healthy
([`docker/frontend-entrypoint.sh`](../docker/frontend-entrypoint.sh)). The
healthcheck was also tightened to require the rendered catalogue rather than
merely a 200, so "healthy" means "serving the shop":

```dockerfile
HEALTHCHECK CMD curl -fsS http://localhost:3100 | grep -q 'product-grid' || exit 1
```

Verified against a cold container recreated from the image: healthy only once
the catalogue renders, and the first request a customer can possibly make
already has it.

The measurements above were taken with autocannon at 50 connections for 15
seconds, against the containerised stack on a developer machine with other
containers running — treat them as a ratio between options, not as a capacity
figure for production hardware.
