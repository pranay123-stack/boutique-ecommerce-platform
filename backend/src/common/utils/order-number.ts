import { randomInt } from 'node:crypto';

/**
 * Human-facing order reference, e.g. BQ-20260816-4F7K2A.
 *
 * Deliberately NOT sequential: a monotonically increasing order number leaks
 * business volume to anyone who places two orders, and invites enumeration of
 * other customers' orders. The random suffix is checked for uniqueness against
 * the database by the caller.
 */
export function generateOrderNumber(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I - avoids read-back errors
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += alphabet[randomInt(alphabet.length)];
  return `BQ-${stamp}-${suffix}`;
}
