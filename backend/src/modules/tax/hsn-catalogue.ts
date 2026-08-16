/**
 * HSN codes and GST rates by product category.
 *
 * Classification is the merchant's legal responsibility, not ours - this is a
 * starting point for a clothing and homeware boutique that has to be reviewed
 * against the current rate notifications before the store goes live. It is
 * kept in one file precisely so that review has one place to happen.
 *
 * The apparel threshold below is the part people get wrong: readymade garments
 * and made-up textile articles are rated on the *sale value per piece*, so the
 * same product can attract 5% or 12% depending on what it sells for. Hard-
 * coding a single rate per product silently under-collects on the expensive
 * half of the catalogue.
 */
export interface HsnClassification {
  hsnCode: string;
  description: string;
  /** Flat rate, or the rate resolved from the piece price. */
  rate: number | ((unitPrice: number) => number);
}

/** Readymade garments: 5% up to ₹1,000 a piece, 12% above. */
const APPAREL = (unitPrice: number): number => (unitPrice <= 1000 ? 5 : 12);

export const HSN_BY_CATEGORY: Record<string, HsnClassification> = {
  dresses: { hsnCode: '6204', description: "Women's dresses", rate: APPAREL },
  'tops-blouses': { hsnCode: '6206', description: "Women's blouses and shirts", rate: APPAREL },
  outerwear: { hsnCode: '6202', description: "Women's coats and jackets", rate: APPAREL },
  scarves: { hsnCode: '6214', description: 'Shawls, scarves and mufflers', rate: APPAREL },
  bags: { hsnCode: '4202', description: 'Handbags and travel goods', rate: 18 },
  jewellery: { hsnCode: '7117', description: 'Imitation jewellery', rate: 3 },
  textiles: { hsnCode: '6304', description: 'Made-up furnishing articles', rate: APPAREL },
  ceramics: { hsnCode: '6912', description: 'Ceramic tableware and ornaments', rate: 12 },
  // Parent categories, so a product filed directly under one is still
  // classified rather than falling through to the 18% catch-all.
  accessories: { hsnCode: '6505', description: 'Hats and other headgear', rate: APPAREL },
  women: { hsnCode: '6204', description: "Women's outerwear", rate: APPAREL },
  home: { hsnCode: '6304', description: 'Made-up furnishing articles', rate: APPAREL },
};

/** Unclassified goods. 18% is the standard rate, and over-collecting is recoverable. */
export const DEFAULT_CLASSIFICATION: HsnClassification = {
  hsnCode: '9999',
  description: 'Other goods',
  rate: 18,
};

export function classify(categorySlug: string, unitPrice: number) {
  const entry = HSN_BY_CATEGORY[categorySlug] ?? DEFAULT_CLASSIFICATION;
  return {
    hsnCode: entry.hsnCode,
    gstRate: typeof entry.rate === 'function' ? entry.rate(unitPrice) : entry.rate,
  };
}
