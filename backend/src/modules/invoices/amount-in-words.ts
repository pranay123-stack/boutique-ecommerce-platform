const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function underThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${underThousand(n % 100)}` : ''}`;
}

/**
 * Rupees in words, Indian style: crore / lakh / thousand rather than
 * millions. Invoices are expected to state the amount in words as a check
 * against a tampered figure.
 */
export function amountInWords(amount: string | number): string {
  const value = Math.abs(Number(amount));
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);

  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1000);
  const rest = rupees % 1000;

  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));

  let words = parts.length ? `${parts.join(' ')} Rupees` : '';
  if (paise) words += `${words ? ' and ' : ''}${underThousand(paise)} Paise`;
  return `${words} Only`;
}
