import { classify, DEFAULT_CLASSIFICATION, HSN_BY_CATEGORY } from './hsn-catalogue';
import { GST_SLABS } from './gst.constants';

describe('HSN classification', () => {
  it('rates apparel on the price per piece', () => {
    // Readymade garments are 5% up to 1,000 a piece and 12% above, so a single
    // flat rate per product silently under-collects on the expensive half of
    // the catalogue.
    expect(classify('dresses', 900).gstRate).toBe(5);
    expect(classify('dresses', 1000).gstRate).toBe(5);
    expect(classify('dresses', 1001).gstRate).toBe(12);
  });

  it('applies flat rates where the slab does not depend on price', () => {
    expect(classify('bags', 500).gstRate).toBe(18);
    expect(classify('bags', 50000).gstRate).toBe(18);
    expect(classify('jewellery', 2000).gstRate).toBe(3);
  });

  it('falls back to the standard rate for an unknown category', () => {
    const result = classify('something-new', 500);
    expect(result.hsnCode).toBe(DEFAULT_CLASSIFICATION.hsnCode);
    // Over-collecting is recoverable; under-collecting is funded by the business.
    expect(result.gstRate).toBe(18);
  });

  it('only ever produces a rate that exists in law', () => {
    const prices = [1, 999, 1000, 1001, 25000];
    for (const slug of [...Object.keys(HSN_BY_CATEGORY), 'unmapped']) {
      for (const price of prices) {
        expect(GST_SLABS).toContain(classify(slug, price).gstRate as never);
      }
    }
  });

  it('gives every mapped category a plausible HSN code', () => {
    for (const [slug, entry] of Object.entries(HSN_BY_CATEGORY)) {
      expect(entry.hsnCode).toMatch(/^\d{4,8}$/);
      expect(entry.description).not.toHaveLength(0);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
