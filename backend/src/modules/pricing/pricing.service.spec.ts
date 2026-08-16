import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Prisma, CouponType } from '@prisma/client';
import { PricingService, type PricingInputLine } from './pricing.service';
import { CouponsService } from '../coupons/coupons.service';
import { GstService } from '../tax/gst.service';

const dec = (v: string | number) => new Prisma.Decimal(v);

const line = (over: Partial<PricingInputLine> = {}): PricingInputLine => ({
  variantId: 'v1',
  productId: 'p1',
  categoryId: 'c1',
  sku: 'SKU-1',
  productName: 'Silk Scarf',
  variantName: 'Saffron',
  imageUrl: null,
  unitPrice: dec('1000.00'),
  quantity: 1,
  taxRatePercent: dec('5'),
  weightGrams: 200,
  hsnCode: '6214',
  ...over,
});

const CONFIG: Record<string, unknown> = {
  'shipping.freeThreshold': 1999,
  'shipping.flatRate': 99,
  'payment.cod.enabled': true,
  'payment.cod.charge': 49,
  'payment.cod.minOrder': 0,
  'payment.cod.maxOrder': 20000,
  'tax.pricesIncludeGst': true,
  'tax.roundOffTotal': true,
  'tax.sellerState': 'Karnataka',
  'tax.sellerGstin': '29ABCDE1234F1Z5',
};

describe('PricingService', () => {
  let pricing: PricingService;
  let coupons: { evaluate: jest.Mock };

  const build = async (overrides: Record<string, unknown> = {}) => {
    const values = { ...CONFIG, ...overrides };
    coupons = { evaluate: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PricingService,
        GstService,
        { provide: CouponsService, useValue: coupons },
        { provide: ConfigService, useValue: { get: (key: string) => values[key] } },
      ],
    }).compile();
    return moduleRef.get(PricingService);
  };

  beforeEach(async () => {
    pricing = await build();
  });

  it('returns an all-zero basket when empty', async () => {
    const result = await pricing.price([]);
    expect(result.grandTotal.toFixed(2)).toBe('0.00');
    expect(result.lines).toHaveLength(0);
    expect(result.taxableTotal.toFixed(2)).toBe('0.00');
  });

  describe('GST-inclusive pricing', () => {
    it('charges exactly the advertised price, with the tax backed out of it', async () => {
      // Two scarves at 1,000 each. The customer pays 2,000 - not 2,100.
      const result = await pricing.price([line({ quantity: 2 })], {
        deliveryState: 'Karnataka',
      });
      expect(result.subtotal.toFixed(2)).toBe('2000.00');
      expect(result.shippingTotal.toFixed(2)).toBe('0.00'); // over the free threshold
      expect(result.grandTotal.toFixed(2)).toBe('2000.00');
      // The GST inside that price: 2000 x 5/105 = 95.24
      expect(result.taxTotal.toFixed(2)).toBe('95.24');
      expect(result.taxableTotal.add(result.taxTotal).toFixed(2)).toBe('2000.00');
    });

    it('adds GST on top when the store is configured to quote ex-tax', async () => {
      const exclusive = await build({ 'tax.pricesIncludeGst': false });
      const result = await exclusive.price([line({ quantity: 2 })], {
        deliveryState: 'Karnataka',
      });
      expect(result.taxTotal.toFixed(2)).toBe('100.00');
      expect(result.grandTotal.toFixed(2)).toBe('2100.00');
    });
  });

  describe('place of supply', () => {
    it('splits intra-state supply into CGST and SGST', async () => {
      const result = await pricing.price([line()], { deliveryState: 'Karnataka' });
      expect(result.isInterState).toBe(false);
      expect(result.igstTotal.toFixed(2)).toBe('0.00');
      expect(result.cgstTotal.toFixed(2)).toBe(result.sgstTotal.toFixed(2));
      expect(result.placeOfSupplyCode).toBe('29');
    });

    it('charges IGST on an inter-state supply', async () => {
      const result = await pricing.price([line()], { deliveryState: 'Maharashtra' });
      expect(result.isInterState).toBe(true);
      expect(result.cgstTotal.toFixed(2)).toBe('0.00');
      expect(result.igstTotal.greaterThan(0)).toBe(true);
    });

    it('charges the same total either way, because prices include GST', async () => {
      // The split changes; what the customer pays must not.
      const intra = await pricing.price([line({ unitPrice: dec('2450') })], {
        deliveryState: 'Karnataka',
      });
      const inter = await pricing.price([line({ unitPrice: dec('2450') })], {
        deliveryState: 'Maharashtra',
      });
      expect(intra.grandTotal.toFixed(2)).toBe(inter.grandTotal.toFixed(2));
    });
  });

  describe('shipping', () => {
    it('charges flat shipping below the free threshold', async () => {
      const result = await pricing.price([line({ unitPrice: dec('500.00') })], {
        deliveryState: 'Karnataka',
      });
      expect(result.shippingTotal.toFixed(2)).toBe('99.00');
      expect(result.grandTotal.toFixed(2)).toBe('599.00'); // 500 + 99, GST inside
    });

    it('taxes delivery at the principal supply rate', async () => {
      // Composite supply: the delivery charge follows the goods, not a rate of
      // its own. The highest-value line here is taxed at 12%.
      const result = await pricing.price(
        [
          line({ variantId: 'a', unitPrice: dec('300'), taxRatePercent: dec('5') }),
          line({ variantId: 'b', unitPrice: dec('900'), taxRatePercent: dec('12') }),
        ],
        { deliveryState: 'Karnataka' },
      );
      const delivery = result.charges.find((c) => c.label === 'Delivery');
      expect(delivery).toBeDefined();
      expect(delivery!.gstRate.toFixed(2)).toBe('12.00');
    });

    it('zeroes shipping for a free-shipping coupon', async () => {
      coupons.evaluate.mockResolvedValue({
        couponId: 'c1',
        code: 'FREESHIP',
        type: CouponType.FREE_SHIPPING,
        discount: dec('0'),
        freeShipping: true,
        description: null,
      });
      const result = await pricing.price([line({ unitPrice: dec('500.00') })], {
        couponCode: 'FREESHIP',
        deliveryState: 'Karnataka',
      });
      expect(result.shippingTotal.toFixed(2)).toBe('0.00');
      expect(result.grandTotal.toFixed(2)).toBe('500.00');
      expect(result.charges).toHaveLength(0);
    });
  });

  describe('coupons', () => {
    it('computes GST on the discounted amount', async () => {
      coupons.evaluate.mockResolvedValue({
        couponId: 'c1',
        code: 'WELCOME10',
        type: CouponType.PERCENTAGE,
        discount: dec('100.00'),
        freeShipping: false,
        description: null,
      });

      const result = await pricing.price([line()], {
        couponCode: 'WELCOME10',
        deliveryState: 'Karnataka',
      });
      expect(result.discountTotal.toFixed(2)).toBe('100.00');
      // Charged 900 (+99 delivery). Taxing the pre-discount 1000 would
      // overcharge the customer and overstate the liability.
      expect(result.grandTotal.toFixed(2)).toBe('999.00');
      expect(result.taxableTotal.add(result.taxTotal).toFixed(2)).toBe('999.00');
    });

    it('allocates a basket discount across lines in proportion to value', async () => {
      coupons.evaluate.mockResolvedValue({
        couponId: 'c1',
        code: 'FLAT300',
        type: CouponType.FIXED,
        discount: dec('300.00'),
        freeShipping: false,
        description: null,
      });

      const result = await pricing.price(
        [
          line({ variantId: 'a', unitPrice: dec('1000.00') }),
          line({ variantId: 'b', unitPrice: dec('500.00') }),
        ],
        { couponCode: 'FLAT300', deliveryState: 'Karnataka' },
      );

      expect(result.lines[0].discountAmount.toFixed(2)).toBe('200.00');
      expect(result.lines[1].discountAmount.toFixed(2)).toBe('100.00');
      const allocated = result.lines.reduce(
        (s, l) => s.add(l.discountAmount),
        new Prisma.Decimal(0),
      );
      expect(allocated.toFixed(2)).toBe('300.00');
    });

    it('gives the rounding remainder to the final line so the sum stays exact', async () => {
      coupons.evaluate.mockResolvedValue({
        couponId: 'c1',
        code: 'ODD',
        type: CouponType.FIXED,
        discount: dec('10.00'),
        freeShipping: false,
        description: null,
      });

      // Three equal lines: 10/3 = 3.333... which cannot split evenly.
      const result = await pricing.price(
        [
          line({ variantId: 'a', unitPrice: dec('100.00') }),
          line({ variantId: 'b', unitPrice: dec('100.00') }),
          line({ variantId: 'c', unitPrice: dec('100.00') }),
        ],
        { couponCode: 'ODD', deliveryState: 'Karnataka' },
      );

      const allocated = result.lines.reduce(
        (s, l) => s.add(l.discountAmount),
        new Prisma.Decimal(0),
      );
      expect(allocated.toFixed(2)).toBe('10.00');
      expect(result.lines[2].discountAmount.toFixed(2)).toBe('3.34');
    });

    it('prices without the coupon and reports the reason when one is invalid', async () => {
      coupons.evaluate.mockRejectedValue(new Error('This coupon has expired'));

      const result = await pricing.price([line()], {
        couponCode: 'EXPIRED',
        deliveryState: 'Karnataka',
      });
      // An invalid code must never block checkout.
      expect(result.couponError).toBe('This coupon has expired');
      expect(result.discountTotal.toFixed(2)).toBe('0.00');
      expect(result.grandTotal.toFixed(2)).toBe('1099.00');
    });
  });

  describe('cash on delivery', () => {
    it('adds the handling charge', async () => {
      const result = await pricing.price([line({ unitPrice: dec('2500') })], {
        deliveryState: 'Karnataka',
        paymentMethod: 'COD',
      });
      expect(result.codCharge.toFixed(2)).toBe('49.00');
      expect(result.grandTotal.toFixed(2)).toBe('2549.00');
      expect(result.charges.some((c) => c.label.startsWith('Cash on delivery'))).toBe(true);
    });

    it('charges nothing extra for a prepaid order', async () => {
      const result = await pricing.price([line({ unitPrice: dec('2500') })], {
        deliveryState: 'Karnataka',
      });
      expect(result.codCharge.toFixed(2)).toBe('0.00');
      expect(result.grandTotal.toFixed(2)).toBe('2500.00');
    });

    it('refuses COD above the cash ceiling', async () => {
      await expect(
        pricing.price([line({ unitPrice: dec('25000') })], {
          deliveryState: 'Karnataka',
          paymentMethod: 'COD',
        }),
      ).rejects.toThrow(/not available above/);
    });

    it('refuses COD when it is switched off', async () => {
      const noCod = await build({ 'payment.cod.enabled': false });
      expect(noCod.codAvailability(dec('500')).available).toBe(false);
      await expect(
        pricing.price([line()], { paymentMethod: 'COD', deliveryState: 'Karnataka' }),
      ).resolves.toBeDefined();
      await expect(
        noCod.price([line()], { paymentMethod: 'COD', deliveryState: 'Karnataka' }),
      ).rejects.toThrow(/unavailable/);
    });
  });

  describe('totals', () => {
    it('rounds the payable to the nearest rupee and records the adjustment', async () => {
      // 999.99 x 1: the exact inclusive total is not a whole rupee.
      const result = await pricing.price([line({ unitPrice: dec('999.99') })], {
        deliveryState: 'Karnataka',
      });
      expect(result.grandTotal.mod(1).toNumber()).toBe(0);
      const exact = result.taxableTotal.add(result.taxTotal);
      expect(exact.add(result.roundOff).toFixed(2)).toBe(result.grandTotal.toFixed(2));
    });

    it('leaves the exact total alone when round-off is disabled', async () => {
      const exact = await build({ 'tax.roundOffTotal': false });
      const result = await exact.price([line({ unitPrice: dec('999.99') })], {
        deliveryState: 'Karnataka',
      });
      expect(result.roundOff.toFixed(2)).toBe('0.00');
      expect(result.grandTotal.toFixed(2)).toBe('1098.99'); // 999.99 + 99
    });

    it('keeps the grand total reconcilable from its parts', async () => {
      const result = await pricing.price(
        [
          line({ variantId: 'a', unitPrice: dec('799.50'), quantity: 3 }),
          line({ variantId: 'b', unitPrice: dec('149.99'), quantity: 2 }),
        ],
        { deliveryState: 'Maharashtra' },
      );

      const reconciled = result.taxableTotal
        .add(result.cgstTotal)
        .add(result.sgstTotal)
        .add(result.igstTotal)
        .add(result.roundOff);
      expect(result.grandTotal.toFixed(2)).toBe(reconciled.toFixed(2));
    });

    it('sums shipping weight across quantities', async () => {
      const result = await pricing.price([
        line({ weightGrams: 200, quantity: 3 }),
        line({ variantId: 'b', weightGrams: 500, quantity: 1 }),
      ]);
      expect(result.totalWeightGrams).toBe(1100);
    });
  });
});
