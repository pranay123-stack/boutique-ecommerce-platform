# Security

Audit of the controls implemented, the threats they address, and what remains
before a production launch.

## Authentication

| Control | Implementation |
|---------|----------------|
| Password storage | bcrypt, 12 rounds (4 in tests for speed) |
| Password policy | ≥8 chars with upper, lower and digit; max 72 (bcrypt's limit) |
| Access token | JWT, 15-minute TTL, `Authorization` header only |
| Refresh token | Opaque 48-byte random value, 30-day TTL, `httpOnly` cookie |
| Token storage | Only SHA-256 hashes are persisted — a database leak yields no usable tokens |
| Rotation | Every refresh issues a new token and revokes the old one |
| Reuse detection | Presenting a rotated token revokes the **entire token family** |
| Revocation on password change | All sessions terminated |
| Revocation on suspension | Account status re-checked on every request, not just at login |

**Why the split.** A JWT in a cookie is CSRF-exposed; a long-lived token in
`localStorage` is XSS-exposed. Holding a short access token in memory and the
long-lived one in an `httpOnly` cookie bounds an XSS compromise to 15 minutes
instead of 30 days.

## Authorisation

Role-based with fine-grained permissions (`product:write`, `order:refund`,
`audit:read`, …). Roles are permission bundles, so a new "warehouse operator"
role requires no guard changes.

- Routes are **protected by default**; `@Public()` is an explicit opt-out.
- Ownership is verified on every order and cart read — for members by `userId`,
  for guests by the checkout email.
- `POST /admin/*` requires a staff role *and* the specific permission.

Covered by integration tests asserting a CUSTOMER receives 403 on every admin
route, and that a SUPPORT role can read orders but not write products or issue
refunds.

## Input handling

- `ValidationPipe` with `whitelist` **and** `forbidNonWhitelisted`: unknown
  properties are rejected, not silently dropped. Sending `roleId` during
  registration returns 400 rather than quietly no-oping.
- All query parameters are declared on DTOs, giving typed enums and bounded
  strings.
- Pagination is hard-capped at 100 items to bound query cost.

## Injection

- **SQL** — Prisma parameterises everything. The handful of raw queries use
  tagged templates (`$queryRaw\`…\``), which parameterise as well. The only
  `$executeRawUnsafe` call is `truncateAll()`, which is guarded to
  `NODE_ENV=test` and builds its identifier list from `pg_tables`.
- **XSS** — React escapes by default. The single `dangerouslySetInnerHTML` is
  JSON-LD structured data built from `JSON.stringify` of server-controlled
  values.
- **CSRF** — Bearer-authenticated routes are inherently safe (script cannot set
  `Authorization` cross-origin). Cookie-authenticated routes (`/auth/refresh`,
  `/auth/logout`) use double-submit tokens compared in constant time.

## Payments

- Charge amount is read from the database, never the request body.
- Signature verification uses `timingSafeEqual` — no timing oracle.
- Webhooks verify HMAC over the **raw bytes** received; `main.ts` preserves
  `rawBody` before JSON parsing rewrites it.
- Replay is prevented by `UNIQUE(provider, eventId)` — a database constraint,
  not application logic.
- Refunds carry a stable idempotency key so a retried request cannot double-pay.
- The mock gateway refuses to load when `NODE_ENV=production`.
- Every attempt is recorded in `payments` with its raw payload for
  reconciliation and dispute handling.

## Transport & headers

`helmet` sets `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, and in production a CSP plus HSTS
(`max-age=31536000; includeSubDomains; preload`). CORS is an explicit
allow-list — never a wildcard — and `CORS_ORIGINS` is mandatory in production.

## Rate limiting

One global limiter (600 req/min/IP by default), tightened per handler where
abuse actually lands:

| Route | Limit |
|-------|-------|
| `POST /auth/register` | 5 / min |
| `POST /auth/login` | 10 / min |
| `POST /auth/forgot-password` | 3 / min |
| `POST /auth/reset-password` | 5 / min |
| `POST /auth/resend-verification` | 3 / 5 min |

> **Configuration hazard, verified by test.** `@nestjs/throttler` evaluates
> *every* configured throttler against *every* request. A second named
> throttler intended "for auth routes" silently caps the whole API at its
> limit. This build shipped that bug and it was caught in end-to-end testing;
> `throttler.config.spec.ts` now asserts exactly one throttler is declared.

## File uploads

Validated against **magic bytes**, not the declared MIME type or extension —
`.jpg` in a filename means nothing. Only JPEG, PNG, WebP, GIF and AVIF
signatures are accepted. Files are buffered in memory so nothing untrusted
touches disk before validation, given a server-generated name, and stored with
an extension derived from the detected type. Path traversal is blocked by
asserting the resolved path stays within the uploads root.

## Account enumeration

- Login returns an identical error for unknown and known accounts, and always
  performs a bcrypt comparison so response timing does not differ.
- `forgot-password` always reports success.

## Secrets & configuration

`validateEnv` fails the boot rather than starting misconfigured. In production
it additionally requires: secrets ≥32 chars, `JWT_ACCESS_SECRET` ≠
`JWT_REFRESH_SECRET`, explicit `CORS_ORIGINS`, real gateway credentials when
`PAYMENT_MODE=live`, and rejects values containing `changeme`, `secret`,
`placeholder` or `password`.

Logs redact `authorization`, `cookie`, `x-csrf-token`, all password fields and
`set-cookie`. Audit records redact anything whose key contains `password`,
`token`, `secret` or `signature`.

## Audit trail

Every mutating admin action writes an `audit_logs` row: actor, role, action,
entity, before/after payload, IP and user agent. Writes are fire-and-forget —
a failure to record an audit entry must never roll back the business operation
it describes.

## Dependency audit

`npm audit --audit-level=high` runs in CI for both packages and fails the build
on high or critical advisories.

**Current status: 0 vulnerabilities in both packages.**

Three high-severity advisories were found during the audit and fixed rather
than suppressed:

| Package | Advisory | Resolution |
|---------|----------|------------|
| `nodemailer` | SMTP command injection via `envelope.size` and CRLF in transport name | Upgraded to 9.0.5 |
| `js-yaml` (via `@nestjs/swagger`) | Exponential parse time → DoS | `overrides: { "js-yaml": "^5.3.0" }` |
| `postcss`, `sharp` (via `next`) | XSS + arbitrary `.map` disclosure; libvips CVEs | `overrides` pinning patched lines |

Two of the three reach the project only as transitive dependencies whose
parents have not yet bumped, so npm `overrides` pin the patched lines
explicitly. Re-check these on each dependency upgrade.

---

## Before going live

These are deliberately **not** implemented — they need real infrastructure and
credentials rather than code:

| Item | Why it matters |
|------|----------------|
| TLS termination + HSTS preload | Cookies are `secure` only in production; terminate TLS at the load balancer |
| Real gateway credentials + webhook URL | Set `PAYMENT_MODE=live` and register the webhook endpoint with Razorpay |
| Secret manager | Move secrets out of `.env` into AWS Secrets Manager / Vault, with rotation |
| WAF / DDoS protection | Application rate limiting is per-instance; edge protection belongs at CDN |
| Distributed rate limiting | Swap the in-memory throttler storage for the Redis backend across instances |
| 2FA for staff accounts | Admin compromise is the highest-impact scenario |
| Penetration test | An independent review before handling real payment data |
| PCI-DSS SAQ-A scope confirmation | Card data never touches this server (gateway-hosted checkout), which should keep scope to SAQ-A — confirm with the acquirer |
| Log shipping and alerting | Wire the Sentry DSN and OTLP endpoint; alert on 5xx rate and failed payments |
| Backup verification | `database/scripts/backup.sh` exists; schedule it and **test a restore** |
