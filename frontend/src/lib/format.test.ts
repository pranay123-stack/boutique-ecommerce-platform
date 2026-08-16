import { describe, expect, it } from 'vitest';
import { formatMoney, formatDate, humanizeStatus, formatNumber, toAddressInput } from './format';

describe('formatMoney', () => {
  it('formats a decimal string from the API', () => {
    // Money crosses the wire as a string to avoid float precision loss.
    expect(formatMoney('1499.00')).toBe('₹1,499');
    expect(formatMoney('1499.50')).toBe('₹1,499.50');
  });

  it('formats plain numbers', () => {
    expect(formatMoney(2450)).toBe('₹2,450');
  });

  it('groups in the Indian numbering system', () => {
    // 12,40,000 - not 1,240,000.
    expect(formatMoney('1240000')).toBe('₹12,40,000');
  });

  it('renders zero rather than an empty string', () => {
    expect(formatMoney('0')).toBe('₹0');
    expect(formatMoney(0)).toBe('₹0');
  });

  it('degrades gracefully on missing or invalid values', () => {
    expect(formatMoney(null)).toBe('₹0');
    expect(formatMoney(undefined)).toBe('₹0');
    expect(formatMoney('not-a-number')).toBe('—');
  });
});

describe('humanizeStatus', () => {
  it('turns an enum into readable text', () => {
    expect(humanizeStatus('PAYMENT_CONFIRMED')).toBe('Payment confirmed');
    expect(humanizeStatus('OUT_FOR_DELIVERY')).toBe('Out for delivery');
    expect(humanizeStatus('SHIPPED')).toBe('Shipped');
  });
});

describe('formatDate', () => {
  it('formats an ISO date', () => {
    expect(formatDate('2026-08-16T10:30:00Z')).toMatch(/16 Aug 2026/);
  });
  it('handles null', () => {
    expect(formatDate(null)).toBe('—');
  });
});

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(1234567)).toBe('12,34,567');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(null)).toBe('0');
  });
});

describe('toAddressInput', () => {
  const saved = {
    id: 'addr_1', userId: 'usr_1', label: 'Home',
    fullName: 'Ada Sharma', phone: '+919876543210',
    line1: '14 Richmond Road', line2: 'Apt 5B',
    city: 'Bengaluru', state: 'Karnataka', postalCode: '560025', country: 'IN',
    isDefaultShipping: true, isDefaultBilling: true,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null,
  } as any;

  it('keeps only the fields the API accepts', () => {
    // Regression: posting a saved address straight through failed validation
    // with "property id should not exist", so checkout with a saved address
    // returned 400 and a returning customer could not order.
    expect(Object.keys(toAddressInput(saved)).sort()).toEqual(
      ['city', 'country', 'fullName', 'line1', 'line2', 'phone', 'postalCode', 'state'],
    );
  });

  it('drops persistence metadata', () => {
    const out = toAddressInput(saved) as Record<string, unknown>;
    for (const key of ['id', 'userId', 'label', 'isDefaultShipping', 'createdAt', 'deletedAt']) {
      expect(out[key]).toBeUndefined();
    }
  });

  it('omits an empty line2 rather than sending null', () => {
    expect('line2' in toAddressInput({ ...saved, line2: null })).toBe(false);
  });

  it('defaults country to IN', () => {
    expect(toAddressInput({ ...saved, country: null }).country).toBe('IN');
  });
});
