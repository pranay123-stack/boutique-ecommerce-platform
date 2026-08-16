/**
 * GST state codes (India).
 *
 * The first two digits of a GSTIN are the state code, and "place of supply" on
 * an invoice must carry it. Comparing the seller's state with the delivery
 * state decides whether a supply is intra-state (CGST + SGST) or inter-state
 * (IGST) - get this wrong and every invoice you issue is defective.
 */
export const GST_STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'dadra and nagar haveli and daman and diu': '26',
  maharashtra: '27',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38',
};

/** Common spellings and older names customers still type. */
const ALIASES: Record<string, string> = {
  'j&k': 'jammu and kashmir',
  'jammu & kashmir': 'jammu and kashmir',
  'new delhi': 'delhi',
  'nct of delhi': 'delhi',
  pondicherry: 'puducherry',
  orissa: 'odisha',
  uttaranchal: 'uttarakhand',
  tamilnadu: 'tamil nadu',
  'andaman & nicobar islands': 'andaman and nicobar islands',
  'daman and diu': 'dadra and nagar haveli and daman and diu',
  'dadra and nagar haveli': 'dadra and nagar haveli and daman and diu',
};

export function normaliseState(state: string): string {
  const key = state.trim().toLowerCase().replace(/\s+/g, ' ');
  return ALIASES[key] ?? key;
}

export function stateCode(state: string): string | null {
  return GST_STATE_CODES[normaliseState(state)] ?? null;
}

/** GST slabs permitted in India. Anything else is a configuration error. */
export const GST_SLABS = [0, 0.25, 3, 5, 12, 18, 28] as const;

/** Fallback HSN for unclassified goods, so an invoice line is never blank. */
export const DEFAULT_HSN = '9999';
