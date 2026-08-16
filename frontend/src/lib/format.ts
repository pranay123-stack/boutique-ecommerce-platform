const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? 'INR';

/**
 * Currency formatting.
 *
 * Money arrives from the API as a decimal *string* (never a float) to avoid
 * precision loss in transit; we parse only at the display boundary.
 */
export function formatMoney(value: string | number | null | undefined, currency = CURRENCY): string {
  const amount = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-IN').format(value ?? 0);
}

/** Human-readable order status, e.g. PAYMENT_CONFIRMED -> "Payment confirmed". */
export function humanizeStatus(status: string): string {
  const s = status.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function relativeTime(value: string | Date): string {
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

/**
 * Reduce an address to exactly the fields the API accepts.
 *
 * A saved address carries persistence metadata (id, userId, label, default
 * flags, timestamps). The API validates with `forbidNonWhitelisted`, so posting
 * one straight through fails with "property id should not exist" - which meant
 * choosing a saved address at checkout returned 400 and a returning customer
 * could not complete an order.
 */
export function toAddressInput(address: {
  fullName: string; phone: string; line1: string; line2?: string | null;
  city: string; state: string; postalCode: string; country?: string | null;
}) {
  return {
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    ...(address.line2 ? { line2: address.line2 } : {}),
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country || 'IN',
  };
}
