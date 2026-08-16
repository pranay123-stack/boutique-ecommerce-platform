import { generateOpaqueToken, hashToken, hmacSha256Hex, safeCompare } from './crypto.util';

describe('crypto utilities', () => {
  it('produces URL-safe tokens of adequate entropy', () => {
    const token = generateOpaqueToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(42);
  });

  it('never repeats a token', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateOpaqueToken()));
    expect(tokens.size).toBe(1000);
  });

  it('hashes deterministically and irreversibly', () => {
    const token = 'reset-token-value';
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toContain(token);
  });

  it('compares equal strings safely and rejects differences', () => {
    expect(safeCompare('abc123', 'abc123')).toBe(true);
    expect(safeCompare('abc123', 'abc124')).toBe(false);
    // Different lengths must not throw - timingSafeEqual would otherwise.
    expect(safeCompare('short', 'muchlongervalue')).toBe(false);
  });

  it('computes stable HMAC-SHA256 signatures', () => {
    const signature = hmacSha256Hex('order_123|pay_456', 'secret');
    expect(signature).toHaveLength(64);
    expect(hmacSha256Hex('order_123|pay_456', 'secret')).toBe(signature);
    expect(hmacSha256Hex('order_123|pay_457', 'secret')).not.toBe(signature);
    expect(hmacSha256Hex('order_123|pay_456', 'other')).not.toBe(signature);
  });
});
