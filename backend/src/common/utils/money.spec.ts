import { Prisma } from '@prisma/client';
import {
  add,
  clampNonNegative,
  fromMinorUnits,
  isEqual,
  money,
  multiply,
  percentOf,
  round2,
  subtract,
  toMinorUnits,
  ZERO,
} from './money';

describe('money', () => {
  it('adds without binary floating point error', () => {
    // The canonical failure: 0.1 + 0.2 === 0.30000000000000004 with floats.
    expect(add('0.1', '0.2').toString()).toBe('0.3');
    expect(add('1499.99', '0.01').toString()).toBe('1500');
  });

  it('multiplies unit price by quantity exactly', () => {
    expect(multiply('19.99', 3).toString()).toBe('59.97');
    expect(multiply('0.07', 100).toString()).toBe('7');
  });

  it('subtracts exactly', () => {
    expect(subtract('100.00', '33.33').toString()).toBe('66.67');
  });

  it('rounds half-up to two places', () => {
    expect(round2(money('10.005')).toFixed(2)).toBe('10.01');
    expect(round2(money('10.004')).toFixed(2)).toBe('10.00');
    expect(round2(money('2.675')).toFixed(2)).toBe('2.68');
  });

  it('computes percentages the way invoicing expects', () => {
    expect(percentOf('1000', 18).toFixed(2)).toBe('180.00');
    expect(percentOf('1499', 5).toFixed(2)).toBe('74.95');
    expect(percentOf('0', 18).toFixed(2)).toBe('0.00');
  });

  it('never returns a negative charge', () => {
    expect(clampNonNegative(money('-5')).toString()).toBe('0');
    expect(clampNonNegative(money('5')).toString()).toBe('5');
  });

  it('round-trips through gateway minor units', () => {
    expect(toMinorUnits('1499.00')).toBe(149900);
    expect(toMinorUnits('0.01')).toBe(1);
    expect(toMinorUnits('1499.995')).toBe(150000);
    expect(fromMinorUnits(149900).toFixed(2)).toBe('1499.00');
    expect(fromMinorUnits(1).toFixed(2)).toBe('0.01');
  });

  it('compares decimals by value, not identity', () => {
    expect(isEqual(money('10.00'), money('10'))).toBe(true);
    expect(isEqual(money('10.01'), money('10'))).toBe(false);
  });

  it('starts from an exact zero', () => {
    expect(ZERO().isZero()).toBe(true);
    expect(ZERO()).toBeInstanceOf(Prisma.Decimal);
  });

  it('keeps precision across a realistic basket', () => {
    // 3 x 1499.99 + 5% tax, computed the way PricingService does it.
    const line = round2(multiply('1499.99', 3));
    const tax = round2(percentOf(line, 5));
    expect(line.toFixed(2)).toBe('4499.97');
    expect(tax.toFixed(2)).toBe('225.00');
    expect(round2(add(line, tax)).toFixed(2)).toBe('4724.97');
  });
});
