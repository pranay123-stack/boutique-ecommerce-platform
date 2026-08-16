# Deployment

## Environments

| | Development | Staging | Production |
|---|---|---|---|
| Database | `boutique_dev` | `boutique_staging` | managed Postgres, separate instance |
| Payments | `PAYMENT_MODE=mock` | Razorpay **test** keys | Razorpay **live** keys |
| Shipping | `SHIPPING_MODE=mock` | Shiprocket sandbox | Shiprocket live |
| Email | MailHog (`localhost:1025`) | real SMTP, internal recipients | real SMTP |
| Storage | local disk | S3 bucket (staging) | S3/CDN |
| Logs | pretty, `debug` | JSON, `info` | JSON, `info` + Sentry |
| Swagger | enabled | enabled | **disabled** |
| Rate limit | 2000/min | 600/min | 600/min |

Each environment gets its own database, credentials and gateway keys. Nothing
is shared.

## Prerequisites

- Node.js ≥ 20.11
- PostgreSQL 16 with `pg_trgm`, `unaccent`, `btree_gin`
- Redis 7
- Docker 24+ (for the containerised path)

## Docker (recommended)

```bash
cp .env.example .env

# Secrets are mandatory — compose refuses to start without them.
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 48)"  >> .env
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 48)" >> .env
echo "COOKIE_SECRET=$(openssl rand -hex 32)"      >> .env
echo "CSRF_SECRET=$(openssl rand -hex 32)"        >> .env

docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run db:seed:prod # demo data — skip in production
```

Storefront on `http://localhost:3100`, API on `http://localhost:4100/api/v1`.

Both images are multi-stage: the runtime layers carry no compiler, no dev
dependencies and no source. Both run as a non-root user (uid 1001) under `tini`
for correct signal handling and zombie reaping, and declare `HEALTHCHECK`s so
the orchestrator can restart a wedged container.

## Railway

Railway hosts the whole stack — API, storefront, Postgres and Redis — in one
project. It is the recommended target because this platform cannot run
serverless: there are **six `@Cron` handlers** and a **BullMQ worker** that need
a process that stays resident, which rules out Vercel, Netlify and Lambda for
the API. (The Next.js storefront alone would be happy on Vercel; see the note
at the end.)

### Why two config files

Both Dockerfiles `COPY backend/…`, `COPY frontend/…` and
`docker/frontend-entrypoint.sh`, so **the build context must be the repository
root**. That means:

- **Leave Root Directory empty on both services.** Setting it makes Railway
  pull down only that subdirectory, and the build then fails on the missing
  paths.
- Railway looks for a single `railway.json` at the repo root by default, which
  cannot describe two services with different Dockerfiles. So each service
  points at its own config file. The **Railway Config File** setting takes an
  absolute path from the repo root and deliberately does *not* follow Root
  Directory.

Committed at the root:

| File | Service | Dockerfile |
|------|---------|------------|
| `railway.api.json` | `api` | `docker/backend.Dockerfile` |
| `railway.web.json` | `web` | `docker/frontend.Dockerfile` |

### Setting it up

1. **Create the project** and add **Postgres** and **Redis** plugins.

   Confirm `CREATE EXTENSION pg_trgm` succeeds — the first migration runs it,
   and typo-tolerant search degrades silently without it.

2. **`api` service** → deploy from this repo.
   - Settings → Config-as-code → **`/railway.api.json`**
   - Root Directory: **empty**
   - Generate a domain

3. **`web` service** → deploy from the *same* repo.
   - Settings → Config-as-code → **`/railway.web.json`**
   - Root Directory: **empty**
   - Generate a domain

4. **Variables** — see the table below.

5. Deploy `api` first, then `web`. The storefront's build reads the API, so the
   API must be answering before the frontend builds.

### Variables

**`api`**

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_HOST=${{Redis.RAILWAY_PRIVATE_DOMAIN}}
REDIS_PORT=6379

NODE_ENV=production
TRUST_PROXY=1                    # without it every customer shares one rate-limit bucket
THROTTLE_USE_REDIS=true          # in-memory counters let N instances permit N x the limit
CORS_ORIGINS=https://<web domain>
FRONTEND_URL=https://<web domain>
BACKEND_URL=https://<api domain>

JWT_ACCESS_SECRET=<openssl rand -hex 48>
JWT_REFRESH_SECRET=<a DIFFERENT one>
COOKIE_SECRET=<openssl rand -hex 32>
CSRF_SECRET=<openssl rand -hex 32>
```

Plus the GST, COD and provider variables from `backend/.env.example`.

**`web`** — these are **compiled into the bundle at build time**, not read at
runtime. Changing any of them requires a rebuild, or the storefront keeps
serving the old values:

```bash
NEXT_PUBLIC_API_ORIGIN=https://<api PUBLIC domain>
NEXT_PUBLIC_SITE_URL=https://<web domain>
NEXT_PUBLIC_SITE_NAME=Boutique
# …plus the business identity from frontend/.env.example, or the policy pages
# publish with a "not ready" banner.
```

> Use the API's **public** domain here, not `api.railway.internal`. Private
> networking does not resolve during the build, and the storefront would
> prerender against a dead host.

### Uploads will disappear unless you act

`STORAGE_DRIVER=local` writes to `/app/uploads` inside the container. Railway's
filesystem is ephemeral, so **every product image vanishes on the next
deploy**. Two options:

- **S3 or Cloudflare R2** — correct, and already implemented
  (`src/modules/uploads/providers/s3.storage.ts`):
  ```bash
  STORAGE_DRIVER=s3
  S3_ENDPOINT=…  S3_BUCKET=…  S3_REGION=…
  S3_ACCESS_KEY_ID=…  S3_SECRET_ACCESS_KEY=…
  STORAGE_PUBLIC_BASE_URL=https://cdn.yourdomain.com
  ```
- **A Railway volume** mounted at `/app/uploads` — works, but binds the service
  to one instance. A stopgap, not a destination.

### Migrations

`railway.api.json` runs `npx prisma migrate deploy` as a pre-deploy command, so
migrations apply before the new container takes traffic and a failed migration
blocks the release rather than half-applying it. The Prisma CLI ships in the
runtime image, so this needs no extra dependency.

Never `migrate dev` against a deployed database — see the warning above.

### Healthchecks

`api` is checked on `/health/live`. `web` is checked on `/`, which only proves
it answers; the stricter "is it actually serving the catalogue" check lives in
the Dockerfile's own `HEALTHCHECK` and in `frontend-entrypoint.sh`, which warms
the ISR cache before the container reports ready.

That warm-up is why Railway suits this build: `next build` runs with no
reachable API, so every ISR page would otherwise be prerendered from a failed
fetch and the storefront would answer *"our catalogue is briefly unavailable"*
to the first visitors after each deploy.

### Splitting the storefront onto Vercel later

Viable, and the design already accommodates it: the browser only ever talks to
the frontend's own origin via the `/api/proxy` rewrite, so there is no CORS
setup and no cross-site cookie problem for the httpOnly refresh token.

The catch is the warm-up above — Vercel does not run the Dockerfile entrypoint.
Deploy the API first and point `NEXT_PUBLIC_API_ORIGIN` at its live public
domain so `next build` can reach it and prerender real content.

## Authoring a migration

Always use `npm run migrate:new -- --name your_migration` from `backend/`,
never `prisma migrate dev` directly.

`products.searchVector` is a `GENERATED ALWAYS AS (...) STORED` column, which
Prisma's schema language cannot express. Prisma therefore reads the generation
expression as an ordinary column DEFAULT and writes an invalid
`ALTER COLUMN "searchVector" SET/DROP DEFAULT` into **every** migration it
generates — which Postgres rejects:

```
ERROR: column "searchVector" of relation "products" is a generated column
```

`migrate:new` runs [`scripts/clean-migration.mjs`](../backend/scripts/clean-migration.mjs)
between generating and applying, which strips that statement and leaves a
comment saying why. This was patched by hand twice before it was automated;
do not patch it by hand a third time.

## Manual deployment

```bash
# 1. Database
npm run db:migrate            # prisma migrate deploy — never `migrate dev`

# 2. Build
npm --prefix backend run build
npm --prefix frontend run build

# 3. Run behind a process manager
NODE_ENV=production node backend/dist/main.js
NODE_ENV=production npm --prefix frontend run start
```

## Zero-downtime releases

1. **Migrate first, and make it backwards compatible.** Add columns as
   nullable, backfill, then make them required in a later release. The old
   version must keep working while both are live.
2. Roll out the API, watch `/health/ready` and the 5xx rate.
3. Roll out the storefront.
4. Keep the previous image tagged; rollback is a redeploy of that tag.

Destructive migrations (dropping a column, tightening a constraint) need a
two-release cycle: stop writing the column, deploy, then drop it.

## First-boot behaviour of the storefront

The storefront image is built without a running API, so pages using ISR
(homepage, product detail, category) carry a build-time prerender generated
from an empty payload. Once the stack is up they self-heal on the first
revalidation (120–300 s depending on the route), and the homepage renders a
deliberate fallback in the meantime rather than an empty shell.

If you want the storefront correct from the very first request, either warm it
after deploy:

```bash
docker compose exec frontend node -e "fetch('http://localhost:3100/').then(()=>{})"
# or simply: curl -s http://localhost:3100 >/dev/null   (twice, ~2 min apart)
```

or build the image with the API reachable so the prerender captures real
content.

## Health checks

| Endpoint | Purpose | Orchestrator use |
|----------|---------|------------------|
| `GET /health/live` | Process is up | Liveness probe — restart on failure |
| `GET /health/ready` | Database reachable, cache checked, heap sane | Readiness probe — remove from the load balancer |

`/health/ready` reports the cache as **degraded**, not down, when Redis is
unavailable: the storefront still serves correctly from the database, so the
instance should keep taking traffic.

## Reverse proxy

```nginx
server {
    listen 443 ssl http2;
    server_name shop.example.com;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location /api/ {
        proxy_pass http://127.0.0.1:4100;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        # Required for per-IP rate limiting to see the real client.
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
    }
}
```

Set `app.set('trust proxy', 1)` in `main.ts` when running behind a proxy so the
throttler reads the real client IP rather than the proxy's.

## Payment configuration

1. Create a Razorpay account and generate **live** API keys.
2. Set `PAYMENT_MODE=live`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
3. Register the webhook: `https://shop.example.com/api/v1/webhooks/razorpay`
   subscribing to `payment.captured`, `payment.failed`, `refund.processed`.
4. Copy the webhook signing secret into `RAZORPAY_WEBHOOK_SECRET`.
5. Verify with a ₹1 live transaction, then refund it from the admin console.

The webhook endpoint is unauthenticated by design — trust comes from the HMAC
over the raw body. It must be reachable from the public internet.

## Shipping configuration

1. Shiprocket account, then set `SHIPPING_MODE=live`, `SHIPROCKET_EMAIL`,
   `SHIPROCKET_PASSWORD`.
2. Configure the pickup location in Shiprocket and set
   `SHIPPING_PICKUP_POSTCODE` to match.
3. The adapter caches the 10-day bearer token in Redis and refreshes on 401.
4. The hourly tracking job mirrors carrier scans into
   `shipment_tracking_events`, so customer-facing tracking survives a provider
   outage.

## Storage

### Media URLs

`STORAGE_PUBLIC_BASE_URL` defaults to the **relative** `/static`, and the
storefront proxies `/static/*` to the API (see `next.config.mjs`). This is
deliberate: `next/image` optimises server-side, so an absolute
`http://localhost:4100/...` is unreachable from inside the frontend container,
where `localhost` is the frontend itself — every product image renders broken
while the page still looks structurally correct.

With `STORAGE_DRIVER=s3` set this to the absolute CDN origin instead; that host
is already permitted by `images.remotePatterns`.

Local disk is development only — it does not survive multiple instances. For
production set `STORAGE_DRIVER=s3` with bucket credentials, and point
`STORAGE_PUBLIC_BASE_URL` at a CDN. Uploads are written with
`Cache-Control: public, max-age=31536000, immutable`, which is safe because
keys are content-unique.

## Monitoring

Structured JSON logs (pino) with a request id on every line. Integration points
are pre-wired: set `SENTRY_DSN` for error tracking and
`OTEL_EXPORTER_OTLP_ENDPOINT` for traces.

Alert on: 5xx rate, `/health/ready` failures, payment failure rate, webhook
processing failures, queue depth, and reconciliation settling more than a
handful of orders (which means callbacks are being lost).

## Backups

```bash
DATABASE_URL=... ./database/scripts/backup.sh
```

Schedule daily, retain 14 days (the script prunes automatically), store
off-site — and **test a restore**. An untested backup is not a backup.

## Rollback

```bash
docker compose down
docker tag boutique-backend:<previous-sha> boutique-backend:latest
docker compose up -d
```

Roll the application back first. Only roll the database back if the migration
was destructive — restoring a dump loses every order placed since it was taken.
