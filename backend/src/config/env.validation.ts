/**
 * Fail-fast environment validation.
 *
 * A misconfigured production deploy should crash on boot with a precise message,
 * never start up and leak a default secret. Rules tighten automatically when
 * NODE_ENV=production.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const env = (config.NODE_ENV as string) ?? 'development';
  const isProd = env === 'production';

  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  for (const key of required) {
    if (!config[key]) errors.push(`${key} is required`);
  }

  if (!['development', 'test', 'staging', 'production'].includes(env)) {
    errors.push(`NODE_ENV must be one of development|test|staging|production (got "${env}")`);
  }

  const dbUrl = config.DATABASE_URL as string | undefined;
  if (dbUrl && !/^postgres(ql)?:\/\//.test(dbUrl)) {
    errors.push('DATABASE_URL must be a postgresql:// connection string');
  }

  // Secrets must be long enough to resist offline brute force.
  const minSecretLength = isProd ? 32 : 16;
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = config[key] as string | undefined;
    if (value && value.length < minSecretLength) {
      errors.push(`${key} must be at least ${minSecretLength} characters`);
    }
  }
  if (config.JWT_ACCESS_SECRET && config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }

  if (isProd) {
    // Live money and live shipments require real credentials.
    if (config.PAYMENT_MODE === 'live') {
      for (const key of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) {
        if (!config[key]) errors.push(`${key} is required when PAYMENT_MODE=live`);
      }
    }
    if (config.SHIPPING_MODE === 'live') {
      for (const key of ['SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD']) {
        if (!config[key]) errors.push(`${key} is required when SHIPPING_MODE=live`);
      }
    }
    if (config.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
        if (!config[key]) errors.push(`${key} is required when STORAGE_DRIVER=s3`);
      }
    }
    if (!config.CORS_ORIGINS) {
      errors.push('CORS_ORIGINS must be set explicitly in production');
    }
    const weak = ['changeme', 'secret', 'placeholder', 'password'];
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'COOKIE_SECRET']) {
      const v = String(config[key] ?? '').toLowerCase();
      if (weak.some((w) => v.includes(w))) errors.push(`${key} looks like a placeholder value`);
    }
  }

  if (errors.length) {
    throw new Error(
      `Invalid environment configuration:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
  return config;
}
