/**
 * Per-route rate limits for authentication endpoints.
 *
 * `@Throttle` is a decorator, so its arguments are evaluated when the module is
 * imported - long before Nest builds the DI container and ConfigService exists.
 * That is why these cannot come from ConfigService like every other setting.
 *
 * Reading `process.env` at import time works because `main.ts` loads dotenv on
 * its first line, before any module is required.
 *
 * The multiplier exists so an end-to-end harness can raise these limits
 * explicitly for its own IP without weakening the defaults. Production leaves
 * it at 1; the limits below are the ones that actually ship.
 */
// Math.max(1, NaN) is NaN, which would produce NaN limits and disable
// throttling entirely - so the value is validated, not just clamped.
const parsedMultiplier = Number(process.env.AUTH_THROTTLE_MULTIPLIER);
const MULTIPLIER = Number.isFinite(parsedMultiplier) && parsedMultiplier > 1 ? parsedMultiplier : 1;

const perMinute = (limit: number) => ({ limit: limit * MULTIPLIER, ttl: 60_000 });

export const AUTH_THROTTLE = {
  /** Account creation - blocks bulk signup abuse. */
  register: perMinute(5),
  /** Sign-in - the credential-stuffing surface. */
  login: perMinute(10),
  /** Reset links are emailed, so this also caps outbound spam. */
  forgotPassword: perMinute(3),
  /** Guessing a reset token. */
  resetPassword: perMinute(5),
  /** Verification email resends. */
  resendVerification: { limit: 3 * MULTIPLIER, ttl: 300_000 },
} as const;
