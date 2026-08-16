/**
 * Indian financial year runs 1 April - 31 March, and GST invoice numbering
 * restarts with it. Rendered as "2026-27".
 */
export function financialYearOf(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0 = January
  const start = month >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
