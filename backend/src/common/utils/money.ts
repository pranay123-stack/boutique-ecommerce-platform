import { Prisma } from '@prisma/client';

/**
 * Money helpers.
 *
 * All monetary arithmetic goes through Prisma's Decimal (decimal.js) so we
 * never accumulate binary floating point error. `0.1 + 0.2 !== 0.3` is not an
 * acceptable failure mode for an order total.
 *
 * Storage  : Decimal(12,2) in the store currency (e.g. 1499.00 INR)
 * Gateways : integer minor units (paise/cents) - converted only at the edge.
 */
export type Money = Prisma.Decimal;

export const money = (value: Prisma.Decimal.Value): Money => new Prisma.Decimal(value);

export const ZERO = (): Money => new Prisma.Decimal(0);

/** Round half-up to 2dp - the convention Indian and EU invoicing expect. */
export const round2 = (value: Money): Money =>
  value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export const add = (...values: Prisma.Decimal.Value[]): Money =>
  values.reduce<Money>((acc, v) => acc.add(new Prisma.Decimal(v)), ZERO());

export const multiply = (a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): Money =>
  new Prisma.Decimal(a).mul(new Prisma.Decimal(b));

export const subtract = (a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): Money =>
  new Prisma.Decimal(a).sub(new Prisma.Decimal(b));

/** Percentage of an amount, rounded to 2dp. */
export const percentOf = (amount: Prisma.Decimal.Value, percent: Prisma.Decimal.Value): Money =>
  round2(new Prisma.Decimal(amount).mul(new Prisma.Decimal(percent)).div(100));

/** Never let a computed charge go negative. */
export const clampNonNegative = (value: Money): Money => (value.isNegative() ? ZERO() : value);

/** Convert store currency to gateway minor units. 1499.00 -> 149900 */
export const toMinorUnits = (value: Prisma.Decimal.Value): number =>
  new Prisma.Decimal(value).mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();

/** Convert gateway minor units back to store currency. 149900 -> 1499.00 */
export const fromMinorUnits = (minor: number): Money =>
  new Prisma.Decimal(minor).div(100).toDecimalPlaces(2);

/** Serialise a Decimal for JSON responses as a fixed 2dp string. */
export const toJSONMoney = (value: Prisma.Decimal | null | undefined): string | null =>
  value === null || value === undefined ? null : new Prisma.Decimal(value).toFixed(2);

export const isEqual = (a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): boolean =>
  new Prisma.Decimal(a).equals(new Prisma.Decimal(b));

export const isGreaterThan = (a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): boolean =>
  new Prisma.Decimal(a).greaterThan(new Prisma.Decimal(b));

export const isLessThan = (a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): boolean =>
  new Prisma.Decimal(a).lessThan(new Prisma.Decimal(b));
