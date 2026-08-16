export interface ProductImage {
  id?: string;
  url: string;
  thumbnailUrl?: string | null;
  alt?: string | null;
  position?: number;
  isPrimary?: boolean;
}

export interface VariantAttribute {
  name: string;
  type: string;
  value: string;
  slug: string;
  hexColor: string | null;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  price: string;
  discountPrice: string | null;
  available: number;
  inStock?: boolean;
  attributes?: VariantAttribute[];
  images?: ProductImage[];
}

export interface ProductOption {
  name: string;
  type: string;
  values: Array<{ value: string; slug: string; hexColor: string | null }>;
}

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface Product {
  id: string;
  name: string;
  slug: string;
  status?: ProductStatus;
  description?: string | null;
  shortDescription?: string | null;
  brand?: string | null;
  basePrice: string;
  compareAtPrice?: string | null;
  currency?: string;
  ratingAverage: string;
  ratingCount: number;
  totalSold?: number;
  isFeatured?: boolean;
  isNewArrival?: boolean;
  tags?: string[];
  category?: { id: string; name: string; slug: string };
  images: ProductImage[];
  variants: ProductVariant[];
  options?: ProductOption[];
  primaryImage?: string | null;
  effectivePrice?: number;
  priceFrom?: number;
  priceTo?: number;
  discountPercent?: number;
  inStock?: boolean;
  totalAvailable?: number;
  reviews?: Review[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  productCount?: number;
  children?: Category[];
}

export interface CartItem {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  lineSubtotal: string;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
  available: number;
  hasStockIssue: boolean;
}

export interface Cart {
  id: string | null;
  couponCode: string | null;
  currency: string;
  items: CartItem[];
  itemCount: number;
  subtotal: string;
  discountTotal: string;
  shippingTotal: string;
  taxTotal: string;
  taxableTotal: string;
  roundOff: string;
  grandTotal: string;
  /** Indian retail quotes GST-inclusive prices, so taxTotal is inside grandTotal. */
  pricesIncludeGst: boolean;
  codAvailable: boolean;
  codUnavailableReason: string | null;
  /** COD handling charge, and what the order would total with it. */
  codCharge: string;
  codGrandTotal: string | null;
  coupon: { code: string; description: string | null; discount: string; freeShipping: boolean } | null;
  couponError: string | null;
  hasStockIssues: boolean;
}

export interface Address {
  id?: string;
  label?: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  isDefaultShipping?: boolean;
  isDefaultBilling?: boolean;
}

export type OrderStatus =
  | 'PENDING' | 'PAYMENT_CONFIRMED' | 'PROCESSING' | 'PACKED'
  | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'REFUNDED';

export type PaymentStatus =
  | 'PENDING' | 'CREATED' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED'
  | 'REFUNDED' | 'PARTIALLY_REFUNDED';

export interface OrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  sku: string;
  productName: string;
  variantName: string | null;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  discountAmount: string;
  taxAmount: string;
  lineTotal: string;
  // GST snapshot, frozen at order time.
  hsnCode?: string | null;
  gstRate?: string;
  taxableValue?: string;
  cgstRate?: string;
  cgstAmount?: string;
  sgstRate?: string;
  sgstAmount?: string;
  igstRate?: string;
  igstAmount?: string;
}

export interface Shipment {
  id: string;
  status: string;
  awbCode: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  trackingEvents?: Array<{
    id: string; status: string; description: string | null;
    location: string | null; occurredAt: string;
  }>;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: string;
  discountTotal: string;
  shippingTotal: string;
  taxTotal: string;
  grandTotal: string;
  currency: string;
  // GST breakdown, as charged.
  taxableTotal?: string;
  cgstTotal?: string;
  sgstTotal?: string;
  igstTotal?: string;
  isInterState?: boolean;
  placeOfSupply?: string | null;
  sellerGstin?: string | null;
  codCharge?: string;
  couponCode: string | null;
  shippingAddress: Address;
  billingAddress: Address;
  customerNote?: string | null;
  createdAt: string;
  placedAt: string;
  items: OrderItem[];
  payments?: Array<{ id: string; status: PaymentStatus; amount: string; method: string | null; createdAt: string }>;
  refunds?: Array<{ id: string; amount: string; status: string; createdAt: string }>;
  shipments?: Shipment[];
  statusHistory?: Array<{ id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>;
  user?: { id: string; email: string; firstName: string; lastName: string | null } | null;
  guestEmail?: string | null;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  status: string;
  author?: string;
  createdAt: string;
  user?: { firstName: string; lastName: string | null };
  product?: { id: string; name: string; slug: string; images?: ProductImage[] };
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: 'ADMIN' | 'MANAGER' | 'SUPPORT' | 'CUSTOMER';
  emailVerified: boolean;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  ctaText: string | null;
  placement: string;
}

export interface Homepage {
  heroBanners: Banner[];
  promoBanners: Banner[];
  featured: Product[];
  newArrivals: Product[];
  bestSellers: Product[];
  categories: Category[];
}

export interface Facets {
  brands: Array<{ name: string; count: number }>;
  attributes: Array<{ name: string; values: Array<{ value: string; slug: string; hexColor: string | null; count: number }> }>;
  priceRange: { min: number; max: number };
}

// ---------------------------------------------------------------- returns

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'PICKUP_SCHEDULED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'INSPECTED'
  | 'REFUNDED'
  | 'CANCELLED';

export type ReturnResolution = 'REFUND' | 'EXCHANGE';

export interface ReturnEligibilityItem {
  orderItemId: string;
  productName: string;
  variantName: string | null;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  refundPerUnit: string;
}

export interface ReturnEligibility {
  eligible: boolean;
  reason: string | null;
  windowDays: number;
  closesAt: string | null;
  items: ReturnEligibilityItem[];
}

export interface ReturnItem {
  id: string;
  orderItemId: string;
  quantity: number;
  reason: string | null;
  restockable: boolean | null;
  refundAmount: string;
  orderItem?: OrderItem;
}

export interface ReturnRequest {
  id: string;
  rmaNumber: string;
  orderId: string;
  status: ReturnStatus;
  resolution: ReturnResolution;
  reason: string;
  customerNote: string | null;
  staffNote: string | null;
  refundAmount: string;
  pickupScheduledAt: string | null;
  receivedAt: string | null;
  inspectedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  items: ReturnItem[];
  order?: { orderNumber: string; grandTotal?: string };
  user?: { email: string; firstName: string; lastName: string | null } | null;
  guestEmail?: string | null;
}

export type ContactStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'SPAM';

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  orderNumber: string | null;
  subject: string;
  message: string;
  status: ContactStatus;
  staffNote: string | null;
  createdAt: string;
  handledAt: string | null;
}
