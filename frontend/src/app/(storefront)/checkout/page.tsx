'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Lock, ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useCart } from '@/hooks/use-cart';
import { useCreateOrder } from '@/hooks/use-orders';
import { useAddresses } from '@/hooks/use-account';
import { useAuthStore } from '@/store/auth-store';
import { formatMoney, toAddressInput } from '@/lib/format';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Address } from '@/types';

const EMPTY: Address = {
  fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'IN',
};

export default function CheckoutPage() {
  const router = useRouter();
  const { data: cart, isLoading } = useCart();
  const user = useAuthStore((s) => s.user);
  const { data: savedAddresses } = useAddresses(Boolean(user));
  const createOrder = useCreateOrder();

  const [address, setAddress] = useState<Address>(EMPTY);
  const [guestEmail, setGuestEmail] = useState('');
  const [note, setNote] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addressCheck, setAddressCheck] = useState<{ serviceable: boolean; reason?: string } | null>(null);
  // Placing an order empties the cart. Without this flag the empty-cart guard
  // below fires immediately afterwards and redirects the customer back to
  // /cart, racing the navigation to the payment page.
  const [placed, setPlaced] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'PREPAID' | 'COD'>('PREPAID');

  // Preselect the customer's default shipping address.
  useEffect(() => {
    if (savedAddresses?.length && !selectedAddressId) {
      const preferred = savedAddresses.find((a) => a.isDefaultShipping) ?? savedAddresses[0];
      if (preferred?.id) {
        setSelectedAddressId(preferred.id);
        setAddress({ ...preferred });
      }
    }
  }, [savedAddresses, selectedAddressId]);

  useEffect(() => {
    if (placed) return;
    if (!isLoading && (!cart || cart.items.length === 0)) router.replace('/cart');
  }, [cart, isLoading, router, placed]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!user && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail)) {
      next.guestEmail = 'A valid email is required';
    }
    if (!address.fullName.trim()) next.fullName = 'Required';
    if (!/^\+?[0-9\s-]{10,20}$/.test(address.phone)) next.phone = 'Enter a valid phone number';
    if (!address.line1.trim()) next.line1 = 'Required';
    if (!address.city.trim()) next.city = 'Required';
    if (!address.state.trim()) next.state = 'Required';
    if (!/^\d{6}$/.test(address.postalCode)) next.postalCode = 'Enter a 6-digit PIN code';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** Check serviceability as soon as a complete PIN code is entered. */
  const checkPin = async (postalCode: string) => {
    if (!/^\d{6}$/.test(postalCode)) {
      setAddressCheck(null);
      return;
    }
    try {
      const result = await api.post<{ valid: boolean; serviceable: boolean; reason?: string }>(
        '/shipping/validate-address',
        { address: toAddressInput({ ...address, postalCode }) },
        { auth: false },
      );
      setAddressCheck(result);
    } catch {
      setAddressCheck(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setPlaced(true);
    try {
      const order = await createOrder.mutateAsync({
        // Strip persistence metadata: a saved address carries id/userId/label
        // and the API rejects unknown properties.
        shippingAddress: toAddressInput(address),
        ...(user ? { saveAddress } : { guestEmail }),
        customerNote: note || undefined,
        paymentMethod,
      });
      const emailParam = !user ? `&email=${encodeURIComponent(guestEmail)}` : '';
      // A COD order is already confirmed - there is no gateway to visit, so
      // sending the customer to the payment page would only confuse them.
      router.push(
        paymentMethod === 'COD'
          ? `/order-confirmation/${order.id}?method=cod${emailParam}`
          : `/checkout/payment?orderId=${order.id}${emailParam}`,
      );
    } catch (err) {
      // Order creation failed - re-enable the empty-cart guard.
      setPlaced(false);
      throw err;
    }
  };

  if (isLoading || !cart) {
    return <div className="container py-24 text-center text-muted-foreground">Loading checkout…</div>;
  }

  // Both totals are priced by the API, so what the customer sees here is
  // exactly what the order will be created with.
  const codCharge = Number(cart.codCharge ?? 0);
  const payableTotal =
    paymentMethod === 'COD' && cart.codGrandTotal ? cart.codGrandTotal : cart.grandTotal;

  const field = (name: keyof Address, label: string, opts: { required?: boolean; type?: string; placeholder?: string } = {}) => (
    <div>
      <Label htmlFor={name}>
        {label} {opts.required !== false ? <span className="text-destructive">*</span> : null}
      </Label>
      <Input
        id={name}
        type={opts.type ?? 'text'}
        value={(address[name] as string) ?? ''}
        placeholder={opts.placeholder}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        onChange={(e) => {
          setAddress((a) => ({ ...a, [name]: e.target.value }));
          setSelectedAddressId(null);
        }}
        onBlur={name === 'postalCode' ? (e) => void checkPin(e.target.value) : undefined}
        className="mt-1.5"
      />
      {errors[name] ? (
        <p id={`${name}-error`} className="mt-1 text-xs text-destructive">{errors[name]}</p>
      ) : null}
    </div>
  );

  return (
    <div className="container py-12">
      <Button variant="ghost" asChild className="mb-6 -ml-3">
        <Link href="/cart"><ArrowLeft className="h-4 w-4" /> Back to bag</Link>
      </Button>

      <h1 className="display-heading text-4xl font-semibold">Checkout</h1>

      <form onSubmit={submit} className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          {/* Contact */}
          {!user ? (
            <section>
              <h2 className="text-lg font-medium">Contact</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your order confirmation and tracking updates go here.{' '}
                <Link href="/login?next=/checkout" className="underline hover:text-foreground">
                  Sign in instead
                </Link>
              </p>
              <div className="mt-4">
                <Label htmlFor="guestEmail">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="guestEmail"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  aria-invalid={Boolean(errors.guestEmail)}
                  className="mt-1.5"
                  placeholder="you@example.com"
                />
                {errors.guestEmail ? <p className="mt-1 text-xs text-destructive">{errors.guestEmail}</p> : null}
              </div>
            </section>
          ) : null}

          {/* Saved addresses */}
          {savedAddresses?.length ? (
            <section>
              <h2 className="text-lg font-medium">Saved addresses</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {savedAddresses.map((saved) => (
                  <button
                    key={saved.id}
                    type="button"
                    onClick={() => {
                      setSelectedAddressId(saved.id!);
                      setAddress({ ...saved });
                      setErrors({});
                    }}
                    className={cn(
                      'rounded-lg border p-4 text-left text-sm transition-colors',
                      selectedAddressId === saved.id ? 'border-primary bg-accent' : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{saved.label ?? saved.fullName}</span>
                      {selectedAddressId === saved.id ? <Check className="h-4 w-4 text-primary" /> : null}
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {saved.line1}, {saved.city}, {saved.state} {saved.postalCode}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {/* Shipping address */}
          <section>
            <h2 className="text-lg font-medium">Shipping address</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">{field('fullName', 'Full name')}</div>
              <div className="sm:col-span-2">{field('phone', 'Phone', { type: 'tel', placeholder: '+91 98765 43210' })}</div>
              <div className="sm:col-span-2">{field('line1', 'Address line 1')}</div>
              <div className="sm:col-span-2">{field('line2', 'Address line 2', { required: false })}</div>
              {field('city', 'City')}
              {field('state', 'State')}
              {field('postalCode', 'PIN code', { placeholder: '560001' })}
              <div>
                <Label htmlFor="country">Country</Label>
                <Input id="country" value="India" disabled className="mt-1.5" />
              </div>
            </div>

            {addressCheck ? (
              <p
                className={cn('mt-3 text-sm', addressCheck.serviceable ? 'text-success' : 'text-destructive')}
                aria-live="polite"
              >
                {addressCheck.serviceable
                  ? '✓ We deliver to this PIN code'
                  : `✗ ${addressCheck.reason ?? 'Not serviceable'}`}
              </p>
            ) : null}

            {user ? (
              <div className="mt-4 flex items-center gap-2">
                <Checkbox
                  id="saveAddress"
                  checked={saveAddress}
                  onCheckedChange={(v) => setSaveAddress(Boolean(v))}
                />
                <Label htmlFor="saveAddress" className="cursor-pointer font-normal">
                  Save this address for next time
                </Label>
              </div>
            ) : null}
          </section>

          <section>
            <Label htmlFor="note">Order note (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Delivery instructions, gift message…"
              className="mt-1.5"
            />
          </section>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-28 lg:h-fit">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-medium">Your order</h2>

              <ul className="max-h-64 space-y-3 overflow-y-auto">
                {cart.items.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <div className="relative h-16 w-13 shrink-0 overflow-hidden rounded bg-muted" style={{ width: 52 }}>
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt="" fill sizes="52px" className="object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.variantName} · ×{item.quantity}
                      </p>
                    </div>
                    <span className="text-sm tabular-nums">{formatMoney(item.lineSubtotal)}</span>
                  </li>
                ))}
              </ul>

              <Separator />

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">How would you like to pay?</legend>
                {(
                  [
                    {
                      value: 'PREPAID' as const,
                      label: 'Pay online',
                      hint: 'Card, UPI, net banking or wallet',
                      disabled: false,
                    },
                    {
                      value: 'COD' as const,
                      label: 'Cash on delivery',
                      hint: cart.codAvailable
                        ? `Pay the courier at your door · +${formatMoney(codCharge)} handling`
                        : (cart.codUnavailableReason ?? 'Not available for this order'),
                      disabled: !cart.codAvailable,
                    },
                  ]
                ).map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                      paymentMethod === option.value && !option.disabled
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50',
                      option.disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent',
                    )}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={option.value}
                      checked={paymentMethod === option.value}
                      disabled={option.disabled}
                      onChange={() => setPaymentMethod(option.value)}
                      className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <span className="text-sm">
                      <span className="font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <Separator />

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(cart.subtotal)}</dd>
                </div>
                {Number(cart.discountTotal) > 0 ? (
                  <div className="flex justify-between text-success">
                    <dt>Discount {cart.couponCode ? `(${cart.couponCode})` : ''}</dt>
                    <dd className="tabular-nums">−{formatMoney(cart.discountTotal)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className="tabular-nums">
                    {Number(cart.shippingTotal) === 0 ? 'Free' : formatMoney(cart.shippingTotal)}
                  </dd>
                </div>
                {paymentMethod === 'COD' && codCharge > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Cash on delivery handling</dt>
                    <dd className="tabular-nums">{formatMoney(codCharge)}</dd>
                  </div>
                ) : null}
                <Separator className="my-2" />
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatMoney(payableTotal)}</dd>
                </div>
                {/*
                  Prices are GST-inclusive, so the tax is stated rather than
                  added. Listing it as its own line above the total would
                  charge the customer twice for the same rupees.
                */}
                <p className="pt-1 text-xs text-muted-foreground">
                  {cart.pricesIncludeGst
                    ? `Inclusive of ${formatMoney(cart.taxTotal)} GST`
                    : `Plus ${formatMoney(cart.taxTotal)} GST`}
                  {paymentMethod === 'COD' ? ' · exact change appreciated' : ''}
                </p>
              </dl>

              <Button type="submit" size="lg" className="w-full" loading={createOrder.isPending}>
                <Lock className="h-4 w-4" />{' '}
                {paymentMethod === 'COD' ? 'Place order' : 'Continue to payment'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {paymentMethod === 'COD'
                  ? 'You pay the courier when your parcel arrives.'
                  : 'Payment is verified on our servers before any order is confirmed.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
