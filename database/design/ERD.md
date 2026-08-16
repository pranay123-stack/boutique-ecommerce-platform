# Entity Relationship Diagram

37 tables across seven domains. Rendered with Mermaid — GitHub and most IDEs
display it inline.

## Domain map

```mermaid
erDiagram
    ROLES ||--o{ USERS : "grants"
    USERS ||--o{ ADDRESSES : saves
    USERS ||--o{ ORDERS : places
    USERS ||--o{ CARTS : owns
    USERS ||--|| WISHLISTS : has
    USERS ||--o{ REVIEWS : writes
    USERS ||--o{ REFRESH_TOKENS : holds

    CATEGORIES ||--o{ CATEGORIES : "parent of"
    CATEGORIES ||--o{ PRODUCTS : contains
    PRODUCTS ||--o{ PRODUCT_VARIANTS : "sold as"
    PRODUCTS ||--o{ PRODUCT_IMAGES : shows
    PRODUCTS ||--o{ REVIEWS : receives
    PRODUCT_VARIANTS ||--|| INVENTORY : "stock for"
    PRODUCT_VARIANTS ||--o{ VARIANT_ATTRIBUTE_VALUES : "described by"
    PRODUCT_ATTRIBUTES ||--o{ PRODUCT_ATTRIBUTE_VALUES : defines
    PRODUCT_ATTRIBUTE_VALUES ||--o{ VARIANT_ATTRIBUTE_VALUES : "used by"
    INVENTORY ||--o{ INVENTORY_HISTORY : "audited by"

    CARTS ||--o{ CART_ITEMS : holds
    PRODUCT_VARIANTS ||--o{ CART_ITEMS : "added as"
    WISHLISTS ||--o{ WISHLIST_ITEMS : holds

    ORDERS ||--o{ ORDER_ITEMS : contains
    ORDERS ||--o{ PAYMENTS : "paid by"
    ORDERS ||--o{ REFUNDS : refunded
    ORDERS ||--o{ SHIPMENTS : "shipped via"
    ORDERS ||--o{ ORDER_STATUS_HISTORY : "tracked by"
    PAYMENTS ||--o{ REFUNDS : "reversed by"
    SHIPMENTS ||--o{ SHIPMENT_TRACKING_EVENTS : "scanned by"

    COUPONS ||--o{ COUPON_REDEMPTIONS : redeemed
    ORDERS ||--o{ COUPON_REDEMPTIONS : records
```

## Order → payment → fulfilment

```mermaid
stateDiagram-v2
    [*] --> PENDING: order placed (stock reserved)
    PENDING --> PAYMENT_CONFIRMED: payment verified (stock committed)
    PENDING --> CANCELLED: expired or cancelled (stock released)
    PAYMENT_CONFIRMED --> PROCESSING
    PROCESSING --> PACKED
    PACKED --> SHIPPED: carrier booked
    SHIPPED --> DELIVERED: carrier scan
    SHIPPED --> RETURNED
    DELIVERED --> RETURNED
    PAYMENT_CONFIRMED --> CANCELLED: stock returned
    PROCESSING --> CANCELLED
    PACKED --> CANCELLED
    RETURNED --> REFUNDED
    CANCELLED --> REFUNDED
    REFUNDED --> [*]
    DELIVERED --> [*]
```

## Table reference

### Identity & access
| Table | Purpose | Notes |
|-------|---------|-------|
| `roles` | Role definitions with a permission array | Seeded: ADMIN, MANAGER, SUPPORT, CUSTOMER |
| `users` | Accounts | Soft-deleted; `status` gates access on every request |
| `refresh_tokens` | Rotating sessions | Stores SHA-256 hash only; `family` enables reuse detection |
| `password_reset_tokens` | Reset links | Hashed, single-use, 1-hour expiry |
| `email_verification_tokens` | Verification links | Hashed, single-use, 24-hour expiry |
| `addresses` | Saved addresses | Snapshotted onto orders, never referenced by FK |

### Catalogue
| Table | Purpose | Notes |
|-------|---------|-------|
| `categories` | Self-referencing tree | Recursive CTE resolves a whole branch |
| `products` | Sellable products | Generated `tsvector`; partial indexes for live rows |
| `product_variants` | The unit actually sold | Owns SKU, price and stock |
| `product_attributes` / `product_attribute_values` | Size, Colour, Material… | Arbitrary axes, no schema change needed |
| `variant_attribute_values` | Variant ↔ option join | Drives the option matrix and faceted filters |
| `product_images` | Gallery | Optionally scoped to a variant |

### Inventory
| Table | Purpose | Notes |
|-------|---------|-------|
| `inventory` | Quantity and reservations per variant | `CHECK(reserved <= quantity)` |
| `inventory_history` | Every movement, append-only | RESTOCK, SALE, RETURN, RESERVATION, RELEASE, ADJUSTMENT, DAMAGE |

### Shopping
| Table | Purpose | Notes |
|-------|---------|-------|
| `carts` | Member and guest carts | Partial unique index on ACTIVE carts only |
| `cart_items` | Lines | Prices re-resolved from the catalogue on every read |
| `wishlists` / `wishlist_items` | Saved items | Explicit dedupe because of NULL semantics |

### Orders & money
| Table | Purpose | Notes |
|-------|---------|-------|
| `orders` | Financial record | Address JSON snapshots; totals in `DECIMAL(12,2)` |
| `order_items` | Line snapshots | Product name, SKU, price frozen at purchase |
| `order_status_history` | Lifecycle audit | Records actor and note per transition |
| `payments` | Gateway attempts | Unique `idempotencyKey`; raw payload retained |
| `payment_webhook_events` | Inbound webhooks | `UNIQUE(provider, eventId)` makes replay a no-op |
| `refunds` | Full and partial refunds | Cumulative total capped by CHECK constraint |

### Fulfilment
| Table | Purpose | Notes |
|-------|---------|-------|
| `shipments` | Carrier consignments | AWB, label, tracking URL |
| `shipment_tracking_events` | Carrier scans | Mirrored locally so tracking survives provider outages |

### Merchandising & operations
| Table | Purpose | Notes |
|-------|---------|-------|
| `coupons` | Discount rules | Percentage, fixed, free shipping; scoped to all/category/product |
| `coupon_redemptions` | Usage ledger | Enforces per-customer limits |
| `reviews` | Ratings | Verified purchase required; moderated before publication |
| `notifications` | Delivery log | Queued via BullMQ with retry and backoff |
| `audit_logs` | Who changed what | Secrets redacted before write |
| `banners` / `settings` | Homepage content and store config | Placement-scoped, schedulable |
