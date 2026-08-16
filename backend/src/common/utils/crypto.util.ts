import { createHash, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

/** URL-safe opaque token for password reset / email verification links. */
export const generateOpaqueToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/**
 * Tokens are stored hashed. A database leak must not hand an attacker a set of
 * working password-reset links, so we persist SHA-256(token) and compare hashes.
 */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Constant-time comparison - prevents timing oracles on secrets/signatures. */
export const safeCompare = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

export const hmacSha256Hex = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex');

export const randomId = (bytes = 12): string => randomBytes(bytes).toString('hex');
