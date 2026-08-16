import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { GstService } from './gst.service';

const dec = (v: string | number) => new Prisma.Decimal(v);

const build = async (overrides: Record<string, unknown> = {}) => {
  const values: Record<string, unknown> = {
    'tax.pricesIncludeGst': true,
    'tax.sellerState': 'Karnataka',
    'tax.sellerGstin': '29ABCDE1234F1Z5',
    ...overrides,
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      GstService,
      { provide: ConfigService, useValue: { get: (k: string) => values[k] } },
    ],
  }).compile();
  return moduleRef.get(GstService);
};

describe('GstService', () => {
  describe('place of supply', () => {
    it('treats the seller state as intra-state', async () => {
      const gst = await build();
      const supply = gst.resolveSupply('Karnataka');
      expect(supply.isInterState).toBe(false);
      expect(supply.placeOfSupplyCode).toBe('29');
    });

    it('treats another state as inter-state', async () => {
      const gst = await build();
      const supply = gst.resolveSupply('Maharashtra');
      expect(supply.isInterState).toBe(true);
      expect(supply.placeOfSupplyCode).toBe('27');
    });

    it('accepts common aliases and casing', async () => {
      const gst = await build();
      expect(gst.resolveSupply('KARNATAKA').isInterState).toBe(false);
      expect(gst.resolveSupply('tamilnadu').placeOfSupplyCode).toBe('33');
      expect(gst.resolveSupply('New Delhi').placeOfSupplyCode).toBe('07');
      expect(gst.resolveSupply('Orissa').placeOfSupplyCode).toBe('21');
    });

    it('defaults an unknown state to inter-state', async () => {
      // IGST is the safe default: under-collecting CGST/SGST leaves the
      // business funding the shortfall itself.
      const gst = await build();
      const supply = gst.resolveSupply('Atlantis');
      expect(supply.isInterState).toBe(true);
      expect(supply.placeOfSupplyCode).toBeNull();
    });
  });

  describe('inclusive pricing (Indian retail norm)', () => {
    it('backs GST out of the advertised price', async () => {
      const gst = await build();
      const supply = gst.resolveSupply('Karnataka');
      // 2450 inclusive of 5%: the tax is 116.67, but CGST and SGST must be
      // equal halves, so it settles at 116.68 (58.34 x 2) and the taxable
      // value absorbs the paisa. The charged total never moves.
      const line = gst.computeLine({ chargedAmount: dec('2450'), gstRate: dec(5) }, supply);
      expect(line.taxAmount.toFixed(2)).toBe('116.68');
      expect(line.taxableValue.toFixed(2)).toBe('2333.32');
      expect(line.taxableValue.add(line.taxAmount).toFixed(2)).toBe('2450.00');

      // Inter-state has no halving constraint, so it keeps the exact split.
      const igst = gst.computeLine(
        { chargedAmount: dec('2450'), gstRate: dec(5) },
        gst.resolveSupply('Maharashtra'),
      );
      expect(igst.taxableValue.toFixed(2)).toBe('2333.33');
      expect(igst.igstAmount.toFixed(2)).toBe('116.67');
      expect(igst.taxableValue.add(igst.taxAmount).toFixed(2)).toBe('2450.00');
    });

    it('adds GST on top when prices are quoted ex-tax', async () => {
      const gst = await build({ 'tax.pricesIncludeGst': false });
      const supply = gst.resolveSupply('Karnataka');
      const line = gst.computeLine({ chargedAmount: dec('1000'), gstRate: dec(18) }, supply);
      expect(line.taxableValue.toFixed(2)).toBe('1000.00');
      expect(line.taxAmount.toFixed(2)).toBe('180.00');
    });
  });

  describe('CGST / SGST / IGST split', () => {
    it('splits intra-state into equal CGST and SGST halves', async () => {
      const gst = await build();
      const supply = gst.resolveSupply('Karnataka');
      const line = gst.computeLine({ chargedAmount: dec('1180'), gstRate: dec(18) }, supply);
      expect(line.cgstAmount.toFixed(2)).toBe(line.sgstAmount.toFixed(2));
      expect(line.cgstRate.toFixed(2)).toBe('9.00');
      expect(line.igstAmount.toFixed(2)).toBe('0.00');
      expect(line.cgstAmount.add(line.sgstAmount).toFixed(2)).toBe(line.taxAmount.toFixed(2));
    });

    it('charges IGST at the full rate inter-state', async () => {
      const gst = await build();
      const supply = gst.resolveSupply('Maharashtra');
      const line = gst.computeLine({ chargedAmount: dec('1180'), gstRate: dec(18) }, supply);
      expect(line.igstRate.toFixed(2)).toBe('18.00');
      expect(line.cgstAmount.toFixed(2)).toBe('0.00');
      expect(line.sgstAmount.toFixed(2)).toBe('0.00');
      expect(line.igstAmount.toFixed(2)).toBe(line.taxAmount.toFixed(2));
    });

    it('keeps CGST equal to SGST even when the tax is an odd number of paise', async () => {
      // The database enforces cgst = sgst, so an odd split must not drift.
      const gst = await build();
      const supply = gst.resolveSupply('Karnataka');
      for (const amount of ['1', '7.77', '1234.56', '999.99', '2450', '0.01']) {
        for (const rate of [3, 5, 12, 18, 28]) {
          const line = gst.computeLine({ chargedAmount: dec(amount), gstRate: dec(rate) }, supply);
          expect(line.cgstAmount.toFixed(2)).toBe(line.sgstAmount.toFixed(2));
          // ...and the customer is still charged exactly the advertised price.
          expect(line.taxableValue.add(line.taxAmount).toFixed(2)).toBe(dec(amount).toFixed(2));
        }
      }
    });

    it('never levies both IGST and CGST/SGST', async () => {
      const gst = await build();
      for (const state of ['Karnataka', 'Kerala', 'Delhi']) {
        const supply = gst.resolveSupply(state);
        const line = gst.computeLine({ chargedAmount: dec('500'), gstRate: dec(12) }, supply);
        const hasIgst = line.igstAmount.greaterThan(0);
        const hasCgst = line.cgstAmount.greaterThan(0);
        expect(hasIgst && hasCgst).toBe(false);
      }
    });

    it('handles a zero-rated item', async () => {
      const gst = await build();
      const supply = gst.resolveSupply('Karnataka');
      const line = gst.computeLine({ chargedAmount: dec('300'), gstRate: dec(0) }, supply);
      expect(line.taxableValue.toFixed(2)).toBe('300.00');
      expect(line.taxAmount.toFixed(2)).toBe('0.00');
    });

    it('falls back to a default HSN so an invoice line is never blank', async () => {
      const gst = await build();
      const supply = gst.resolveSupply('Karnataka');
      expect(gst.computeLine({ chargedAmount: dec('100'), gstRate: dec(5) }, supply).hsnCode).toBe(
        '9999',
      );
      expect(
        gst.computeLine({ chargedAmount: dec('100'), gstRate: dec(5), hsnCode: '6214' }, supply)
          .hsnCode,
      ).toBe('6214');
    });
  });

  describe('order totals', () => {
    it('sums line components exactly', async () => {
      const gst = await build();
      const supply = gst.resolveSupply('Karnataka');
      const lines = [
        gst.computeLine({ chargedAmount: dec('2450'), gstRate: dec(5) }, supply),
        gst.computeLine({ chargedAmount: dec('1180'), gstRate: dec(18) }, supply),
      ];
      const totals = gst.totals(lines);
      expect(totals.cgstTotal.toFixed(2)).toBe(totals.sgstTotal.toFixed(2));
      expect(totals.taxableTotal.add(totals.taxTotal).toFixed(2)).toBe('3630.00');
      expect(totals.igstTotal.toFixed(2)).toBe('0.00');
    });
  });
});
