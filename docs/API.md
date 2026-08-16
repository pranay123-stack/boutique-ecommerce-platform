# API Reference

Boutique Commerce REST API — **v1.0.0**

> This file is generated from the live OpenAPI document so it cannot drift from the
> implementation. Regenerate with `npm run docs:api` from the repository root while
> the API is running.

- **Base URL (local):** `http://localhost:4100/api/v1`
- **Interactive docs:** `http://localhost:4100/api/v1/docs` (Swagger UI, non-production only)
- **Machine-readable spec:** `http://localhost:4100/api/v1/docs-json`

---

## Conventions

### Response envelope

Every successful response is wrapped consistently:

```json
{ "success": true, "data": { } }
```

Paginated endpoints add a `meta` block and return the rows in `data`:

```json
{
  "success": true,
  "data": [ ],
  "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7,
            "hasNext": true, "hasPrevious": false }
}
```

### Errors

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Validation failed",
             "details": ["email must be an email"] },
  "path": "/api/v1/auth/register",
  "timestamp": "2026-08-16T04:00:00.000Z",
  "requestId": "6f1c…"
}
```

| Status | `error.code` | Meaning |
|--------|--------------|---------|
| 400 | `VALIDATION_ERROR` | Request body or query failed validation |
| 401 | `UNAUTHORIZED` | Missing, expired or invalid access token |
| 403 | `FORBIDDEN` | Authenticated but lacking the required role/permission |
| 404 | `NOT_FOUND` | Resource does not exist or is not visible to you |
| 409 | `DUPLICATE_RESOURCE` | Unique constraint violated (e.g. email, SKU) |
| 429 | `RATE_LIMITED` | Throttle exceeded — back off and retry |
| 500 | `INTERNAL_ERROR` | Unexpected failure; details are logged, never returned |

### Authentication

Two credentials, deliberately different in nature:

| Credential | Transport | Lifetime | Why |
|-----------|-----------|----------|-----|
| Access token (JWT) | `Authorization: Bearer <token>` | 15 min | Short-lived, stateless, never stored in a cookie so CSRF cannot replay it |
| Refresh token (opaque) | `httpOnly` cookie | 30 days | Revocable server-side; only a SHA-256 hash is persisted |

Refresh tokens **rotate on every use**. Presenting an already-rotated token is
treated as theft: the entire token family is revoked immediately.

Cookie-authenticated routes (`/auth/refresh`, `/auth/logout`) additionally require
the double-submit CSRF header `X-CSRF-Token`, echoing the `csrfToken` cookie.

```bash
# 1. Sign in
curl -X POST http://localhost:4100/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -c cookies.txt \
  -d '{"email":"customer@boutique.local","password":"Customer@12345"}'

# 2. Call a protected route
curl http://localhost:4100/api/v1/account/profile \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Guest access

Carts and orders work without an account. Send a stable `X-Session-Id` header to
identify the anonymous cart; pass `?email=` to read a guest order back.

### Rate limits

A single global limiter (default **600 requests/minute/IP**) protects the API.
Authentication routes tighten this per-handler: registration 5/min, login 10/min,
password reset 3/min.

---

## Endpoints

**89 paths · 109 operations**

### Account

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/account/addresses` | Bearer | Saved addresses |
| `POST` | `/api/v1/account/addresses` | Bearer | Save a new address |
| `PATCH` | `/api/v1/account/addresses/{id}` | Bearer | Update a saved address |
| `DELETE` | `/api/v1/account/addresses/{id}` | Bearer | Delete a saved address |
| `GET` | `/api/v1/account/profile` | Bearer | Profile of the signed-in customer |
| `PATCH` | `/api/v1/account/profile` | Bearer | Update name and phone |

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/change-password` | Bearer | Change password for the signed-in user |
| `POST` | `/api/v1/auth/forgot-password` | Public | Send a password reset link |
| `POST` | `/api/v1/auth/login` | Public | Authenticate and receive an access token |
| `POST` | `/api/v1/auth/logout` | Public | Revoke the current session |
| `GET` | `/api/v1/auth/me` | Bearer | Return the authenticated principal |
| `POST` | `/api/v1/auth/refresh` | Public | Rotate the refresh token and mint a new access token |
| `POST` | `/api/v1/auth/register` | Public | Create a customer account |
| `POST` | `/api/v1/auth/resend-verification` | Bearer | Re-send the verification email |
| `POST` | `/api/v1/auth/reset-password` | Public | Complete a password reset |
| `POST` | `/api/v1/auth/verify-email` | Public | Confirm an email address |

### Cart

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/cart` | Public | Current cart with live pricing and stock status |
| `DELETE` | `/api/v1/cart` | Public | Empty the cart |
| `POST` | `/api/v1/cart/coupon` | Public | Apply a discount code |
| `DELETE` | `/api/v1/cart/coupon` | Public | Remove the applied discount code |
| `POST` | `/api/v1/cart/items` | Public | Add a variant to the cart |
| `PATCH` | `/api/v1/cart/items/{itemId}` | Public | Change a line quantity (0 removes it) |
| `DELETE` | `/api/v1/cart/items/{itemId}` | Public | Remove a line from the cart |
| `POST` | `/api/v1/cart/merge` | Public | Merge a guest cart into the signed-in cart after login |

### Catalog

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/categories/tree` | Public | Category tree with rolled-up product counts |
| `GET` | `/api/v1/categories/{slug}` | Public | Category detail by slug |
| `GET` | `/api/v1/products` | Public | Search, filter, sort and paginate the catalogue |
| `GET` | `/api/v1/products/facets` | Public | Filter facet counts for the current query |
| `GET` | `/api/v1/products/{slug}` | Public | Product detail with variants, images, options and reviews |
| `GET` | `/api/v1/products/{slug}/related` | Public | Related products from the same category |

### Content

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/content/homepage` | Public | Complete homepage payload |
| `GET` | `/api/v1/content/settings` | Public | Public storefront settings |

### Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/notifications` | Bearer | Notification history for the signed-in customer |

### Orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/orders` | Public | Place an order from the active cart |
| `GET` | `/api/v1/orders` | Bearer | Order history for the signed-in customer |
| `GET` | `/api/v1/orders/lookup/{orderNumber}` | Public | Look up an order by number (guest tracking) |
| `GET` | `/api/v1/orders/{id}` | Public | Order detail with items, payments, shipments and history |
| `PATCH` | `/api/v1/orders/{id}/cancel` | Public | Cancel an order that has not shipped |

### Payments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/payments/intent` | Public | Create a gateway payment order |
| `POST` | `/api/v1/payments/mock/complete` | Public | [dev only] Complete a mock payment |
| `GET` | `/api/v1/payments/order/{orderId}` | Bearer | Payment attempts recorded against an order |
| `POST` | `/api/v1/payments/verify` | Public | Verify a completed checkout |

### Reviews

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/reviews` | Bearer | Write a review |
| `GET` | `/api/v1/reviews/mine` | Bearer | Reviews written by the signed-in customer |
| `GET` | `/api/v1/reviews/product/{productId}` | Public | Approved reviews and rating distribution for a product |

### Shipping

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/shipping/rates` | Public | Available carriers and charges for a destination |
| `POST` | `/api/v1/shipping/validate-address` | Public | Validate and check serviceability of a delivery address |

### Wishlist

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/wishlist` | Bearer | Saved items for the signed-in customer |
| `POST` | `/api/v1/wishlist/items` | Bearer | Save a product (idempotent) |
| `DELETE` | `/api/v1/wishlist/items/{itemId}` | Bearer | Remove a saved item |
| `DELETE` | `/api/v1/wishlist/products/{productId}` | Bearer | Remove a product from the wishlist by product id |

### Admin / Analytics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/admin/analytics/best-sellers` | Staff | Best selling products by units |
| `GET` | `/api/v1/admin/analytics/dashboard` | Staff | Headline KPIs: revenue, orders, customers, alerts |
| `GET` | `/api/v1/admin/analytics/order-status` | Staff | Order counts and value by status |
| `GET` | `/api/v1/admin/analytics/reports/sales` | Staff | Flat sales report rows, ready for CSV export |
| `GET` | `/api/v1/admin/analytics/revenue-by-category` | Staff | Revenue split by category |
| `GET` | `/api/v1/admin/analytics/sales-series` | Staff | Daily revenue and order counts |
| `GET` | `/api/v1/admin/analytics/top-customers` | Staff | Highest-spending customers |

### Admin / Audit

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/admin/audit-logs` | Staff | Search the immutable audit trail |

### Admin / Catalog

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/admin/categories` | Staff | List every category, including inactive |
| `POST` | `/api/v1/admin/categories` | Staff | Create a category or subcategory |
| `PATCH` | `/api/v1/admin/categories/{id}` | Staff | Update a category |
| `DELETE` | `/api/v1/admin/categories/{id}` | Staff | Soft-delete an empty category |
| `GET` | `/api/v1/admin/products` | Staff | List all products including drafts and archived |
| `POST` | `/api/v1/admin/products` | Staff | Create a product with its variants, stock and images |
| `GET` | `/api/v1/admin/products/{id}` | Staff | Full product record for the editor |
| `PATCH` | `/api/v1/admin/products/{id}` | Staff | Update a product and reconcile its variants |
| `DELETE` | `/api/v1/admin/products/{id}` | Staff | Soft-delete (archive) a product |

### Admin / Content

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/admin/content/banners` | Staff | List banners |
| `POST` | `/api/v1/admin/content/banners` | Staff | Create a banner |
| `PATCH` | `/api/v1/admin/content/banners/{id}` | Staff | Update a banner |
| `DELETE` | `/api/v1/admin/content/banners/{id}` | Staff | Delete a banner |
| `POST` | `/api/v1/admin/content/featured-products` | Staff | Replace the featured product selection |
| `PATCH` | `/api/v1/admin/content/settings/{key}` | Staff | Update a store setting |

### Admin / Coupons

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/admin/coupons` | Staff | List coupons with redemption counts |
| `POST` | `/api/v1/admin/coupons` | Staff | Create a discount coupon |
| `GET` | `/api/v1/admin/coupons/{id}` | Staff | Coupon detail |
| `PATCH` | `/api/v1/admin/coupons/{id}` | Staff | Update a coupon |
| `DELETE` | `/api/v1/admin/coupons/{id}` | Staff | Delete an unused coupon, or deactivate a redeemed one |

### Admin / Customers

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/admin/customers` | Staff | Search customers |
| `GET` | `/api/v1/admin/customers/{id}` | Staff | Customer detail with order history and lifetime value |
| `PATCH` | `/api/v1/admin/customers/{id}` | Staff | Update customer details, status or role |

### Admin / Inventory

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/admin/inventory/low-stock` | Staff | Variants at or below their reorder threshold |
| `GET` | `/api/v1/admin/inventory/{variantId}` | Staff | Current stock position for a variant |
| `PATCH` | `/api/v1/admin/inventory/{variantId}` | Staff | Set an absolute stock quantity |
| `GET` | `/api/v1/admin/inventory/{variantId}/history` | Staff | Full movement history for a variant |
| `POST` | `/api/v1/admin/inventory/{variantId}/restock` | Staff | Add units to stock |
| `PATCH` | `/api/v1/admin/inventory/{variantId}/threshold` | Staff | Update the low-stock threshold |

### Admin / Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/admin/notifications` | Staff | Delivery log across all channels |

### Admin / Orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/admin/orders` | Staff | Search and filter all orders |
| `GET` | `/api/v1/admin/orders/{id}` | Staff | Full order record for fulfilment |
| `PATCH` | `/api/v1/admin/orders/{id}/note` | Staff | Attach an internal note |
| `PATCH` | `/api/v1/admin/orders/{id}/status` | Staff | Advance the order lifecycle |

### Admin / Payments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/admin/payments/orders/{orderId}/refund` | Staff | Issue a full or partial refund |
| `POST` | `/api/v1/admin/payments/reconcile` | Staff | Re-read stale pending payments from the gateway |
| `POST` | `/api/v1/admin/payments/webhooks/retry` | Staff | Re-process webhook events that previously failed |

### Admin / Reviews

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/admin/reviews` | Staff | Moderation queue |
| `DELETE` | `/api/v1/admin/reviews/{id}` | Staff | Delete a review |
| `PATCH` | `/api/v1/admin/reviews/{id}/status` | Staff | Approve or reject a review |

### Admin / Shipping

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/admin/shipping/orders/{orderId}/shipments` | Staff | Book a shipment for a paid order |
| `GET` | `/api/v1/admin/shipping/orders/{orderId}/shipments` | Staff | Shipments booked against an order |
| `DELETE` | `/api/v1/admin/shipping/shipments/{id}` | Staff | Cancel a shipment with the carrier |
| `POST` | `/api/v1/admin/shipping/shipments/{id}/sync` | Staff | Pull the latest carrier tracking events |
| `POST` | `/api/v1/admin/shipping/sync-all` | Staff | Refresh tracking for every active shipment |

### Admin / Uploads

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `DELETE` | `/api/v1/admin/uploads` | Staff | Delete a stored object by key |
| `POST` | `/api/v1/admin/uploads/image` | Staff | Upload a product image |
| `POST` | `/api/v1/admin/uploads/images` | Staff | Upload up to 10 images at once |

### Invoices

A tax invoice carries the customer's name, address and phone number, so it is
gated exactly like the order it belongs to.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/invoices/order/{orderId}` | Owner, guest with `?email=`, or `order:read` | GST tax invoice as printable HTML, or PDF with `?format=pdf` |

### Returns

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/returns/reasons` | Public | Reasons a customer may pick |
| `GET` | `/api/v1/returns/eligibility/{orderId}` | Owner or guest with `?email=` | What is still returnable, and until when |
| `POST` | `/api/v1/returns` | Owner or guest | Open a return request; quotes the refund without paying it |
| `GET` | `/api/v1/returns` | Customer | Your return requests |
| `GET` | `/api/v1/returns/{id}` | Owner or guest with `?email=` | A single return |
| `PATCH` | `/api/v1/returns/{id}/cancel` | Customer | Withdraw a return before the goods are back |

### Admin / Returns

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/admin/returns` | `order:read` | Return queue, filterable by status |
| `PATCH` | `/api/v1/admin/returns/{id}/status` | `order:write` | Move a return along its lifecycle |
| `POST` | `/api/v1/admin/returns/{id}/inspect` | `order:write` | Record the inspection outcome; restocks only what passes |

### Support

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/support/contact` | Public, 5/min | Contact-form message. Stored first, then emailed |
| `GET` | `/api/v1/admin/support/contact` | `customer:read` | Contact messages |
| `PATCH` | `/api/v1/admin/support/contact/{id}` | `customer:write` | Triage a message |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health/live` | Public | Liveness probe |
| `GET` | `/health/ready` | Public | Readiness probe - verifies database and cache |

---

## Key flows

### Checkout

```
POST /cart/items                 add a variant to the bag
POST /cart/coupon                apply a discount code (revalidated on every read)
POST /orders                     create the order — reserves stock atomically
POST /payments/intent            create the gateway order (amount read from the DB)
POST /payments/verify            verify HMAC + re-read gateway + compare amount
  -> order becomes PAYMENT_CONFIRMED and reserved stock is committed
```

The amount charged is **never** taken from the request body. `POST /payments/verify`
performs three independent checks before an order is marked paid:

1. HMAC-SHA256 over `order_id|payment_id` proves the gateway produced the response.
2. The payment is re-fetched from the gateway — the client's claim is not trusted.
3. The gateway's amount must equal the stored order total.

Webhooks (`POST /webhooks/razorpay`) are the authoritative settlement signal and are
idempotent: the same delivery settles an order exactly once. A reconciliation job
re-reads stale pending payments every 10 minutes to catch lost callbacks.

### Order lifecycle

```
PENDING ──► PAYMENT_CONFIRMED ──► PROCESSING ──► PACKED ──► SHIPPED ──► DELIVERED
   │               │                  │            │           │            │
   └── CANCELLED ◄─┴──────────────────┴────────────┘           └─► RETURNED ─┤
                                                                              ▼
                                                                          REFUNDED
```

Transitions are validated against this state machine server-side; illegal jumps
(for example `PAYMENT_CONFIRMED → DELIVERED`) return `400`.

