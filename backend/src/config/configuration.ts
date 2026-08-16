/**
 * Typed application configuration.
 *
 * Every value the app needs is resolved here exactly once, from `process.env`,
 * and consumed everywhere else through `ConfigService.get<T>()`. Nothing in the
 * codebase is allowed to read `process.env` directly - that keeps environment
 * handling auditable and makes the app trivially testable.
 */

const toBool = (v: string | undefined, fallback = false): boolean =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const toInt = (v: string | undefined, fallback: number): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const toList = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export type PaymentMode = 'live' | 'mock';
export type ShippingMode = 'live' | 'mock';
export type NotificationsMode = 'live' | 'mock';
export type StorageDriver = 'local' | 's3' | 'cloudinary';

export interface AppConfig {
  env: string;
  isProduction: boolean;
  isTest: boolean;
  name: string;
  port: number;
  apiPrefix: string;
  frontendUrl: string;
  backendUrl: string;
  corsOrigins: string[];
}

export const configuration = () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
    name: process.env.APP_NAME ?? 'Boutique Commerce',
    port: toInt(process.env.PORT, 4100),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3100',
    backendUrl: process.env.BACKEND_URL ?? 'http://localhost:4100',
    corsOrigins: toList(process.env.CORS_ORIGINS),
  },
  database: {
    url: process.env.DATABASE_URL as string,
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: toInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: toInt(process.env.REDIS_DB, 0),
    tls: toBool(process.env.REDIS_TLS),
    cacheTtlSeconds: toInt(process.env.CACHE_TTL_SECONDS, 300),
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
    cookieSecret: process.env.COOKIE_SECRET as string,
    csrfSecret: process.env.CSRF_SECRET as string,
    bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 12),
  },
  throttle: {
    ttlSeconds: toInt(process.env.THROTTLE_TTL_SECONDS, 60),
    limit: toInt(process.env.THROTTLE_LIMIT, 600),
    authLimit: toInt(process.env.THROTTLE_AUTH_LIMIT, 10),
    // Shared counters across instances. Only disable for a single-process run.
    useRedis: toBool(process.env.THROTTLE_USE_REDIS, true),
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER ?? 'razorpay',
    mode: (process.env.PAYMENT_MODE ?? 'mock') as PaymentMode,
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID ?? '',
      keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
      apiBase: process.env.RAZORPAY_API_BASE ?? 'https://api.razorpay.com/v1',
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY ?? '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    },
    // Cash on delivery. Still the majority of Indian e-commerce volume, so it
    // is a first-class payment path rather than a fallback: the order is
    // confirmed without a gateway and the money is collected by the courier.
    cod: {
      enabled: toBool(process.env.COD_ENABLED, true),
      charge: Number(process.env.COD_CHARGE ?? 49),
      minOrder: Number(process.env.COD_MIN_ORDER ?? 0),
      // Ceiling on the cash a courier will carry, and on what the business is
      // willing to lose to a refused delivery.
      maxOrder: Number(process.env.COD_MAX_ORDER ?? 20000),
      // Serviceability is really the courier's answer; this is the local
      // fallback used when the shipping provider is in mock mode.
      blockedPincodePrefixes: (process.env.COD_BLOCKED_PIN_PREFIXES ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
    },
  },
  shipping: {
    provider: process.env.SHIPPING_PROVIDER ?? 'shiprocket',
    mode: (process.env.SHIPPING_MODE ?? 'mock') as ShippingMode,
    shiprocket: {
      email: process.env.SHIPROCKET_EMAIL ?? '',
      password: process.env.SHIPROCKET_PASSWORD ?? '',
      apiBase: process.env.SHIPROCKET_API_BASE ?? 'https://apiv2.shiprocket.in/v1/external',
      pickupPostcode: process.env.SHIPPING_PICKUP_POSTCODE ?? '560001',
    },
    freeThreshold: Number(process.env.SHIPPING_FREE_THRESHOLD ?? 1999),
    flatRate: Number(process.env.SHIPPING_FLAT_RATE ?? 99),
  },
  notifications: {
    mode: (process.env.NOTIFICATIONS_MODE ?? 'mock') as NotificationsMode,
    mailFrom: process.env.MAIL_FROM ?? 'Boutique <no-reply@boutique.local>',
    smtp: {
      host: process.env.SMTP_HOST ?? 'localhost',
      port: toInt(process.env.SMTP_PORT, 1025),
      secure: toBool(process.env.SMTP_SECURE),
      user: process.env.SMTP_USER || undefined,
      password: process.env.SMTP_PASSWORD || undefined,
    },
    sms: {
      provider: process.env.SMS_PROVIDER ?? 'mock', // mock | twilio | msg91
      apiKey: process.env.SMS_API_KEY ?? '',
      senderId: process.env.SMS_SENDER_ID ?? 'BOUTIQ',
      accountSid: process.env.SMS_ACCOUNT_SID ?? '', // Twilio only
    },
    whatsapp: {
      provider: process.env.WHATSAPP_PROVIDER ?? 'mock', // mock | meta
      apiKey: process.env.WHATSAPP_API_KEY ?? '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
      templateName: process.env.WHATSAPP_TEMPLATE_NAME ?? '',
      templateLang: process.env.WHATSAPP_TEMPLATE_LANG ?? 'en',
    },
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local') as StorageDriver,
    localPath: process.env.STORAGE_LOCAL_PATH ?? './uploads',
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? '/static',
    maxUploadSizeMb: toInt(process.env.MAX_UPLOAD_SIZE_MB, 5),
    s3: {
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION ?? 'ap-south-1',
      bucket: process.env.S3_BUCKET ?? '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      forcePathStyle: toBool(process.env.S3_FORCE_PATH_STYLE, true),
    },
    cloudinaryUrl: process.env.CLOUDINARY_URL ?? '',
  },
  tax: {
    // Indian retail quotes GST-inclusive prices: an item advertised at 2,450
    // is charged at 2,450, with the tax backed out of that figure.
    pricesIncludeGst: toBool(process.env.TAX_PRICES_INCLUDE_GST, true),
    sellerGstin: process.env.SELLER_GSTIN ?? '',
    sellerLegalName: process.env.SELLER_LEGAL_NAME ?? 'Boutique Commerce Pvt Ltd',
    sellerTradeName: process.env.SELLER_TRADE_NAME ?? 'Boutique',
    sellerAddress: process.env.SELLER_ADDRESS ?? '',
    sellerState: process.env.SELLER_STATE ?? 'Karnataka',
    sellerPan: process.env.SELLER_PAN ?? '',
    invoicePrefix: process.env.INVOICE_PREFIX ?? 'INV',
    // Indian invoices round the payable to the nearest rupee and state the
    // adjustment on its own line, so the figures always reconcile.
    roundOffTotal: toBool(process.env.TAX_ROUND_OFF_TOTAL, true),
  },
  support: {
    // Where contact-form messages are emailed. Blank means store-only, which
    // is still safe: nothing is lost, it just has to be read in the admin.
    inbox: process.env.SUPPORT_INBOX ?? process.env.MAIL_FROM_ADDRESS ?? '',
  },
  returns: {
    // Days after delivery in which a customer may open a return. Mirrored on
    // the storefront's returns policy page - change both together.
    windowDays: Number(process.env.RETURN_WINDOW_DAYS ?? 7),
    exchangeWindowDays: Number(process.env.EXCHANGE_WINDOW_DAYS ?? 14),
  },
  observability: {
    logLevel: process.env.LOG_LEVEL ?? 'info',
    logPretty: toBool(process.env.LOG_PRETTY),
    sentryDsn: process.env.SENTRY_DSN ?? '',
    otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '',
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'boutique-api',
  },
});

export type Configuration = ReturnType<typeof configuration>;
