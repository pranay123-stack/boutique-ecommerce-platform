"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUES = exports.ORDER_STATUS_TRANSITIONS = exports.CACHE_TTL = exports.CACHE_KEYS = exports.STAFF_ROLES = exports.ROLE_PERMISSIONS = exports.PERMISSIONS = exports.ROLES = void 0;
exports.ROLES = {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    SUPPORT: 'SUPPORT',
    CUSTOMER: 'CUSTOMER',
};
exports.PERMISSIONS = {
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
};
exports.ROLE_PERMISSIONS = {
    ADMIN: Object.values(exports.PERMISSIONS),
    MANAGER: [
        exports.PERMISSIONS.PRODUCT_READ,
        exports.PERMISSIONS.PRODUCT_WRITE,
        exports.PERMISSIONS.CATEGORY_WRITE,
        exports.PERMISSIONS.INVENTORY_READ,
        exports.PERMISSIONS.INVENTORY_WRITE,
        exports.PERMISSIONS.ORDER_READ,
        exports.PERMISSIONS.ORDER_WRITE,
        exports.PERMISSIONS.CUSTOMER_READ,
        exports.PERMISSIONS.COUPON_WRITE,
        exports.PERMISSIONS.CONTENT_WRITE,
        exports.PERMISSIONS.ANALYTICS_READ,
        exports.PERMISSIONS.REVIEW_MODERATE,
    ],
    SUPPORT: [
        exports.PERMISSIONS.PRODUCT_READ,
        exports.PERMISSIONS.INVENTORY_READ,
        exports.PERMISSIONS.ORDER_READ,
        exports.PERMISSIONS.ORDER_WRITE,
        exports.PERMISSIONS.CUSTOMER_READ,
    ],
    CUSTOMER: [],
};
exports.STAFF_ROLES = [exports.ROLES.ADMIN, exports.ROLES.MANAGER, exports.ROLES.SUPPORT];
exports.CACHE_KEYS = {
    productList: (hash) => `products:list:${hash}`,
    productDetail: (slug) => `products:detail:${slug}`,
    categoryTree: () => 'categories:tree',
    homepage: () => 'content:homepage',
    facets: (categoryId) => `products:facets:${categoryId}`,
};
exports.CACHE_TTL = {
    PRODUCT_LIST: 120,
    PRODUCT_DETAIL: 300,
    CATEGORY_TREE: 600,
    HOMEPAGE: 180,
    FACETS: 300,
    ANALYTICS: 60,
};
exports.ORDER_STATUS_TRANSITIONS = {
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
exports.QUEUES = {
    NOTIFICATIONS: 'notifications',
    ORDERS: 'orders',
    PAYMENTS: 'payments',
    SHIPPING: 'shipping',
    ANALYTICS: 'analytics',
};
