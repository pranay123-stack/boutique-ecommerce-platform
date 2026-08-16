'use client';

import { use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Package, Truck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useOrder } from '@/hooks/use-orders';
import { InvoiceButton } from '@/components/account/invoice-button';
import { formatMoney, formatDate } from '@/lib/format';

export default function OrderConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? undefined;
  const { data: order, isLoading } = useOrder(id, email);

  if (isLoading) {
    return (
      <div className="container flex justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container py-24 text-center">
        <h1 className="display-heading text-3xl font-semibold">Order not found</h1>
        <Button asChild className="mt-6"><Link href="/products">Continue shopping</Link></Button>
      </div>
    );
  }

  const paid = order.paymentStatus === 'CAPTURED';
  // A COD order is confirmed for dispatch while still unpaid, so "awaiting
  // payment confirmation" would be alarming and wrong.
  const isCod = Number(order.codCharge ?? 0) > 0 || searchParams.get('method') === 'cod';

  return (
    <div className="container max-w-3xl py-16">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <h1 className="display-heading mt-6 text-4xl font-semibold">
          {paid || isCod ? 'Thank you for your order' : 'Order received'}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {isCod && !paid
            ? `Your order is confirmed. Please keep ${formatMoney(order.grandTotal)} ready for the courier — exact change is appreciated.`
            : paid
              ? 'Your payment is confirmed. A receipt is on its way to your inbox.'
              : 'Your order is recorded and awaiting payment confirmation.'}
        </p>
        <p className="mt-4 inline-block rounded-md bg-muted px-4 py-2 font-mono text-sm">
          {order.orderNumber}
        </p>
      </div>

      <Card className="mt-10">
        <CardContent className="p-6">
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Placed</p>
              <p className="mt-1 text-sm font-medium">{formatDate(order.placedAt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-1 text-sm font-medium tabular-nums">{formatMoney(order.grandTotal)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
              <p className="mt-1 text-sm font-medium">{order.status.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
          </div>

          <Separator className="my-6" />

          <h2 className="font-medium">Items</h2>
          <ul className="mt-4 space-y-4">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-4">
                <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded bg-muted">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-muted-foreground">{item.variantName}</p>
                  <p className="text-xs text-muted-foreground">Qty {item.quantity} · SKU {item.sku}</p>
                </div>
                <span className="text-sm tabular-nums">{formatMoney(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <Separator className="my-6" />

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
            </div>
            {Number(order.discountTotal) > 0 ? (
              <div className="flex justify-between text-success">
                <dt>Discount {order.couponCode ? `(${order.couponCode})` : ''}</dt>
                <dd className="tabular-nums">−{formatMoney(order.discountTotal)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="tabular-nums">
                {Number(order.shippingTotal) === 0 ? 'Free' : formatMoney(order.shippingTotal)}
              </dd>
            </div>
            {Number(order.codCharge ?? 0) > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cash on delivery handling</dt>
                <dd className="tabular-nums">{formatMoney(order.codCharge!)}</dd>
              </div>
            ) : null}
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(order.grandTotal)}</dd>
            </div>
            {/* GST is inside the price, so it is stated rather than added. */}
            <p className="pt-1 text-xs text-muted-foreground">
              Inclusive of {formatMoney(order.taxTotal)} GST
              {order.placeOfSupply ? ` · place of supply ${order.placeOfSupply}` : ''}
            </p>
          </dl>

          <Separator className="my-6" />

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Truck className="h-4 w-4" /> Shipping to
              </h3>
              <address className="mt-2 text-sm not-italic leading-relaxed text-muted-foreground">
                {order.shippingAddress.fullName}<br />
                {order.shippingAddress.line1}<br />
                {order.shippingAddress.line2 ? <>{order.shippingAddress.line2}<br /></> : null}
                {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}<br />
                {order.shippingAddress.phone}
              </address>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Package className="h-4 w-4" /> What happens next
              </h3>
              <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                <li>1. We pick and pack your order</li>
                <li>2. You receive a tracking number by email</li>
                <li>3. Delivery in 3–6 working days</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild variant="outline"><Link href="/products">Continue shopping</Link></Button>
        {order.status !== 'PENDING' ? (
          <InvoiceButton orderId={order.id} email={email} variant="outline" />
        ) : null}
        <Button asChild><Link href={`/account/orders/${order.id}`}>Track this order</Link></Button>
      </div>
    </div>
  );
}
