/**
 * Business identity used across the legal pages and invoices.
 *
 * Every value here is read from the environment, because these are the
 * merchant's own particulars and must be theirs before the store takes a real
 * order. `isConfigured` is what the pages use to show an unmistakable
 * "not filled in yet" banner rather than shipping convincing-looking
 * placeholder text as though it were the real policy.
 */
export const legal = {
  siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? 'Boutique',
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME ?? '',
  gstin: process.env.NEXT_PUBLIC_GSTIN ?? '',
  cin: process.env.NEXT_PUBLIC_CIN ?? '',
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS ?? '',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '',
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? '',
  grievanceOfficer: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER ?? '',
  grievanceEmail: process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL ?? '',
  jurisdiction: process.env.NEXT_PUBLIC_JURISDICTION ?? 'Bengaluru, Karnataka',
  returnWindowDays: Number(process.env.NEXT_PUBLIC_RETURN_WINDOW_DAYS ?? 7),
  exchangeWindowDays: Number(process.env.NEXT_PUBLIC_EXCHANGE_WINDOW_DAYS ?? 14),
  refundBusinessDays: Number(process.env.NEXT_PUBLIC_REFUND_BUSINESS_DAYS ?? 7),
  dispatchBusinessDays: Number(process.env.NEXT_PUBLIC_DISPATCH_BUSINESS_DAYS ?? 2),
  freeShippingThreshold: Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD ?? 1999),
  flatShippingRate: Number(process.env.NEXT_PUBLIC_FLAT_SHIPPING_RATE ?? 99),
  codCharge: Number(process.env.NEXT_PUBLIC_COD_CHARGE ?? 49),
  /** Last substantive review of the policy text, not the last deploy. */
  lastUpdated: process.env.NEXT_PUBLIC_POLICY_UPDATED ?? '2026-08-17',
} as const;

/** Which particulars are still unset. Empty means the pages are ready to publish. */
export function missingLegalDetails(): string[] {
  const required: Array<[string, string]> = [
    ['registered business name', legal.legalName],
    ['registered address', legal.address],
    ['support email', legal.supportEmail],
    ['GSTIN', legal.gstin],
    ['grievance officer', legal.grievanceOfficer],
  ];
  return required.filter(([, value]) => !value).map(([label]) => label);
}
