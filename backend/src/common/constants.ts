/** Canonical role names. Seeded into the `roles` table on first boot. */
export const ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SUPPORT: 'SUPPORT',
  CUSTOMER: 'CUSTOMER',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/**
 * Fine-grained permissions. Roles are bundles of these, which lets the business
 * add a "warehouse operator" role later without touching a line of guard code.
 */
export const PERMISSIONS = {
  PRODUCT_READ: 'product:read',
  PRODUCT_WRITE: 'product:write',
  PRODUCT_DELETE: 'product:delete',
  CATEGORY_WRITE: 'category:write',
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',
  ORDER_READ: 'order:read',
  ORDER_WRITE: 'order:write',
  ORDER_REFUND: 'order:refund',
  CUSTOMER_READ: 'customer:read',
  CUSTOMER_WRITE: 'customer:write',
  COUPON_WRITE: 'coupon:write',
  CONTENT_WRITE: 'content:write',
  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
  REVIEW_MODERATE: 'review:moderate',
  SETTINGS_WRITE: 'settings:write',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  ADMIN: Object.values(PERMISSIONS),
  MANAGER: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_WRITE,
    PERMISSIONS.CATEGORY_WRITE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_WRITE,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.COUPON_WRITE,
    PERMISSIONS.CONTENT_WRITE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.REVIEW_MODERATE,
  ],
  SUPPORT: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_WRITE,
    PERMISSIONS.CUSTOMER_READ,
  ],
  CUSTOMER: [],
};

/** Roles permitted to reach any /admin route at all. */
export const STAFF_ROLES: RoleName[] = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SUPPORT];

export const CACHE_KEYS = {
  productList: (hash: string) => `products:list:${hash}`,
  productDetail: (slug: string) => `products:detail:${slug}`,
  categoryTree: () => 'categories:tree',
  homepage: () => 'content:homepage',
  facets: (categoryId: string) => `products:facets:${categoryId}`,
} as const;

export const CACHE_TTL = {
  PRODUCT_LIST: 120,
  PRODUCT_DETAIL: 300,
  CATEGORY_TREE: 600,
  HOMEPAGE: 180,
  FACETS: 300,
  ANALYTICS: 60,
} as const;

/** Legal order status transitions. Anything not listed here is rejected. */
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PAYMENT_CONFIRMED', 'CANCELLED'],
  PAYMENT_CONFIRMED: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['PACKED', 'CANCELLED', 'REFUNDED'],
  PACKED: ['SHIPPED', 'CANCELLED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  RETURNED: ['REFUNDED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

export const QUEUES = {
  NOTIFICATIONS: 'notifications',
  ORDERS: 'orders',
  PAYMENTS: 'payments',
  SHIPPING: 'shipping',
  ANALYTICS: 'analytics',
} as const;
