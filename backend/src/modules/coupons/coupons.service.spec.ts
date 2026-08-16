import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CouponScope, CouponType, Prisma } from '@prisma/client';
import { CouponsService, type CouponEligibleLine } from './coupons.service';
import { PrismaService } from '../../prisma/prisma.service';

const dec = (v: string | number) => new Prisma.Decimal(v);
const HOUR = 3600 * 1000;

const baseCoupon = (over: Record<string, unknown> = {}) => ({
  id: 'coupon-1',
  code: 'SAVE10',
  description: null,
  type: CouponType.PERCENTAGE,
  value: dec(10),
  scope: CouponScope.ALL,
  minOrderValue: dec(0),
  maxDiscountAmount: null,
  usageLimit: null,
  usageLimitPerUser: 1,
  usedCount: 0,
  isActive: true,
  startsAt: new Date(Date.now() - HOUR),
  expiresAt: new Date(Date.now() + HOUR),
  categories: [],
  products: [],
  ...over,
});

const lines: CouponEligibleLine[] = [
  { productId: 'p1', categoryId: 'c1', lineTotal: dec('600.00') },
  { productId: 'p2', categoryId: 'c2', lineTotal: dec('400.00') },
];
const subtotal = dec('1000.00');

describe('CouponsService.evaluate', () => {
  let service: CouponsService;
  let prisma: { coupon: { findUnique: jest.Mock }; couponRedemption: { count: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      coupon: { findUnique: jest.fn() },
      couponRedemption: { count: jest.fn().mockResolvedValue(0) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [CouponsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(CouponsService);
  });

  it('computes a percentage discount', async () => {
    prisma.coupon.findUnique.mockResolvedValue(baseCoupon());
    const result = await service.evaluate('SAVE10', lines, subtotal);
    expect(result.discount.toFixed(2)).toBe('100.00');
  });

  it('caps a percentage discount at maxDiscountAmount', async () => {
    prisma.coupon.findUnique.mockResolvedValue(
      baseCoupon({ value: dec(50), maxDiscountAmount: dec(200) }),
    );
    const result = await service.evaluate('SAVE10', lines, subtotal);
    // 50% of 1000 is 500, but the cap wins.
    expect(result.discount.toFixed(2)).toBe('200.00');
  });

  it('never discounts more than the goods are worth', async () => {
    prisma.coupon.findUnique.mockResolvedValue(
      baseCoupon({ type: CouponType.FIXED, value: dec(5000) }),
    );
    const result = await service.evaluate('BIG', lines, subtotal);
    expect(result.discount.toFixed(2)).toBe('1000.00');
  });

  it('rejects an unknown code', async () => {
    prisma.coupon.findUnique.mockResolvedValue(null);
    await expect(service.evaluate('NOPE', lines, subtotal)).rejects.toThrow(BadRequestException);
  });

  it('rejects an inactive coupon', async () => {
    prisma.coupon.findUnique.mockResolvedValue(baseCoupon({ isActive: false }));
    await expect(service.evaluate('SAVE10', lines, subtotal)).rejects.toThrow('not valid');
  });

  it('rejects an expired coupon', async () => {
    prisma.coupon.findUnique.mockResolvedValue(
      baseCoupon({ expiresAt: new Date(Date.now() - HOUR) }),
    );
    await expect(service.evaluate('SAVE10', lines, subtotal)).rejects.toThrow('expired');
  });

  it('rejects a coupon that has not started', async () => {
    prisma.coupon.findUnique.mockResolvedValue(
      baseCoupon({ startsAt: new Date(Date.now() + HOUR) }),
    );
    await expect(service.evaluate('SAVE10', lines, subtotal)).rejects.toThrow('not active yet');
  });

  it('enforces the global usage limit', async () => {
    prisma.coupon.findUnique.mockResolvedValue(baseCoupon({ usageLimit: 10, usedCount: 10 }));
    await expect(service.evaluate('SAVE10', lines, subtotal)).rejects.toThrow('usage limit');
  });

  it('enforces the per-customer usage limit', async () => {
    prisma.coupon.findUnique.mockResolvedValue(baseCoupon({ usageLimitPerUser: 1 }));
    prisma.couponRedemption.count.mockResolvedValue(1);
    await expect(service.evaluate('SAVE10', lines, subtotal, 'user-1')).rejects.toThrow(
      'already used',
    );
  });

  it('enforces the minimum order value', async () => {
    prisma.coupon.findUnique.mockResolvedValue(baseCoupon({ minOrderValue: dec(2000) }));
    await expect(service.evaluate('SAVE10', lines, subtotal)).rejects.toThrow('minimum order');
  });

  it('applies a category-scoped coupon only to matching lines', async () => {
    prisma.coupon.findUnique.mockResolvedValue(
      baseCoupon({ scope: CouponScope.CATEGORY, categories: [{ id: 'c1' }] }),
    );
    const result = await service.evaluate('SAVE10', lines, subtotal);
    // 10% of the 600 line only.
    expect(result.discount.toFixed(2)).toBe('60.00');
  });

  it('applies a product-scoped coupon only to matching lines', async () => {
    prisma.coupon.findUnique.mockResolvedValue(
      baseCoupon({ scope: CouponScope.PRODUCT, products: [{ id: 'p2' }] }),
    );
    const result = await service.evaluate('SAVE10', lines, subtotal);
    expect(result.discount.toFixed(2)).toBe('40.00');
  });

  it('rejects a scoped coupon when nothing in the basket qualifies', async () => {
    prisma.coupon.findUnique.mockResolvedValue(
      baseCoupon({ scope: CouponScope.PRODUCT, products: [{ id: 'p-other' }] }),
    );
    await expect(service.evaluate('SAVE10', lines, subtotal)).rejects.toThrow('does not apply');
  });

  it('flags free shipping without a monetary discount', async () => {
    prisma.coupon.findUnique.mockResolvedValue(
      baseCoupon({ type: CouponType.FREE_SHIPPING, value: dec(0) }),
    );
    const result = await service.evaluate('FREESHIP', lines, subtotal);
    expect(result.freeShipping).toBe(true);
    expect(result.discount.toFixed(2)).toBe('0.00');
  });

  it('looks codes up case-insensitively', async () => {
    prisma.coupon.findUnique.mockResolvedValue(baseCoupon());
    await service.evaluate('save10', lines, subtotal);
    expect(prisma.coupon.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'SAVE10' } }),
    );
  });
});
