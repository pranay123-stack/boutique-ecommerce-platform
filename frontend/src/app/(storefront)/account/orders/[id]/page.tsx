'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Truck, CheckCircle2, Circle, XCircle, Loader2, Star, PackageOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useCancelOrder, useOrder } from '@/hooks/use-orders';
import { useMyReviews } from '@/hooks/use-reviews';
import { ReviewDialog } from '@/components/account/review-dialog';
import { InvoiceButton } from '@/components/account/invoice-button';
import { ReturnDialog } from '@/components/returns/return-dialog';
import { formatMoney, formatDate, formatDateTime, humanizeStatus } from '@/lib/format';
import { cn } from '@/lib/utils';

const TIMELINE = ['PENDING', 'PAYMENT_CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'];

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: order, isLoading } = useOrder(id);
  const cancelOrder = useCancelOrder();
  const [confirming, setConfirming] = useState(false);
  const [reviewing, setReviewing] = useState<{ productId: string; name: string } | null>(null);
  const [returning, setReturning] = useState(false);
  // Reviews require a delivered order, so only fetch them when one applies.
  const { data: myReviews } = useMyReviews(true);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!order) return <p className="text-muted-foreground">Order not found.</p>;

  const terminal = ['CANCELLED', 'RETURNED', 'REFUNDED'].includes(order.status);
  const canReview = ['DELIVERED', 'SHIPPED'].includes(order.status);
  const reviewedProductIds = new Set((myReviews?.items ?? []).map((r) => r.product?.id));
  const currentStep = TIMELINE.indexOf(order.status);
  const canCancel = ['PENDING', 'PAYMENT_CONFIRMED', 'PROCESSING', 'PACKED'].includes(order.status);

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild className="-ml-3">
        <Link href="/account/orders"><ArrowLeft className="h-4 w-4" /> All orders</Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-mono text-lg">{order.orderNumber}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Placed {formatDate(order.placedAt)}</p>
            </div>
            <Badge variant={order.status === 'DELIVERED' ? 'success' : terminal ? 'destructive' : 'default'}>
              {humanizeStatus(order.status)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {/* Progress timeline */}
          {!terminal ? (
            <ol className="flex items-center justify-between" aria-label="Order progress">
              {TIMELINE.map((step, i) => {
                const done = i <= currentStep;
                return (
                  <li key={step} className="flex flex-1 flex-col items-center text-center">
                    <div className="flex w-full items-center">
                      <div className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : done ? 'bg-primary' : 'bg-border')} />
                      {done ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                      ) : (
                        <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                      )}
                      <div className={cn('h-0.5 flex-1', i === TIMELINE.length - 1 ? 'bg-transparent' : i < currentStep ? 'bg-primary' : 'bg-border')} />
                    </div>
                    <span className={cn('mt-2 text-[10px] leading-tight sm:text-xs', done ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                      {humanizeStatus(step)}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-4 text-sm text-destructive">
              <XCircle className="h-5 w-5" />
              This order is {order.status.toLowerCase()}.
            </div>
          )}

          <Separator className="my-6" />

          {/* Shipments */}
          {order.shipments?.length ? (
            <div className="mb-6 space-y-4">
              <h2 className="flex items-center gap-2 font-medium"><Truck className="h-4 w-4" /> Shipment</h2>
              {order.shipments.map((shipment) => (
                <div key={shipment.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{shipment.courierName ?? 'Courier'}</span>
                    <Badge variant="outline">{humanizeStatus(shipment.status)}</Badge>
                  </div>
                  {shipment.awbCode ? (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">AWB {shipment.awbCode}</p>
                  ) : null}
                  {shipment.estimatedDelivery ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Estimated delivery {formatDate(shipment.estimatedDelivery)}
                    </p>
                  ) : null}

                  {shipment.trackingEvents?.length ? (
                    <ol className="mt-4 space-y-3 border-l border-border pl-4">
                      {shipment.trackingEvents.map((event) => (
                        <li key={event.id} className="relative text-sm">
                          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                          <p className="font-medium">{humanizeStatus(event.status)}</p>
                          {event.description ? <p className="text-muted-foreground">{event.description}</p> : null}
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(event.occurredAt)}{event.location ? ` · ${event.location}` : ''}
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : null}

                  {shipment.trackingUrl ? (
                    <Button asChild variant="outline" size="sm" className="mt-4">
                      <a href={shipment.trackingUrl} target="_blank" rel="noreferrer noopener">
                        Track with courier
                      </a>
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* Items */}
          <h2 className="font-medium">Items</h2>
          <ul className="mt-4 space-y-4">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-4">
                <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded bg-muted">
                  {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" /> : null}
                </div>
                <div className="flex-1 text-sm">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-muted-foreground">{item.variantName}</p>
                  <p className="text-xs text-muted-foreground">Qty {item.quantity} · {formatMoney(item.unitPrice)} each</p>
                  {canReview && item.productId ? (
                    reviewedProductIds.has(item.productId) ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">Review submitted</p>
                    ) : (
                      <Button
                        variant="link"
                        size="sm"
                        className="mt-1 h-auto p-0 text-xs"
                        onClick={() => setReviewing({ productId: item.productId!, name: item.productName })}
                      >
                        <Star className="h-3 w-3" /> Write a review
                      </Button>
                    )
                  ) : null}
                </div>
                <span className="text-sm font-medium tabular-nums">{formatMoney(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <Separator className="my-6" />

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium">Delivery address</h3>
              <address className="mt-2 text-sm not-italic leading-relaxed text-muted-foreground">
                {order.shippingAddress.fullName}<br />
                {order.shippingAddress.line1}<br />
                {order.shippingAddress.line2 ? <>{order.shippingAddress.line2}<br /></> : null}
                {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}<br />
                {order.shippingAddress.phone}
              </address>
            </div>

            <div>
              <h3 className="text-sm font-medium">Payment summary</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
                </div>
                {Number(order.discountTotal) > 0 ? (
                  <div className="flex justify-between text-success">
                    <dt>Discount</dt><dd className="tabular-nums">−{formatMoney(order.discountTotal)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className="tabular-nums">{Number(order.shippingTotal) === 0 ? 'Free' : formatMoney(order.shippingTotal)}</dd>
                </div>
                {Number(order.codCharge ?? 0) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Cash on delivery handling</dt>
                    <dd className="tabular-nums">{formatMoney(order.codCharge!)}</dd>
                  </div>
                ) : null}
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold">
                  <dt>Total</dt><dd className="tabular-nums">{formatMoney(order.grandTotal)}</dd>
                </div>
                {/*
                  Prices include GST, so the tax is stated rather than added -
                  showing it as its own line above the total would double-count
                  it against what the customer actually paid.
                */}
                <div className="pt-1 text-xs text-muted-foreground">
                  Inclusive of {formatMoney(order.taxTotal)} GST
                  {order.isInterState
                    ? ` (IGST ${formatMoney(order.igstTotal ?? 0)})`
                    : Number(order.cgstTotal ?? 0) > 0
                      ? ` (CGST ${formatMoney(order.cgstTotal!)} + SGST ${formatMoney(order.sgstTotal!)})`
                      : ''}
                  {order.placeOfSupply ? ` · place of supply ${order.placeOfSupply}` : ''}
                </div>
                <div className="flex justify-between pt-1">
                  <dt className="text-muted-foreground">Payment</dt>
                  <dd><Badge variant={order.paymentStatus === 'CAPTURED' ? 'success' : 'warning'}>
                    {humanizeStatus(order.paymentStatus)}
                  </Badge></dd>
                </div>
              </dl>
            </div>
          </div>

          {order.paymentStatus !== 'CAPTURED' && order.status === 'PENDING' ? (
            <Button asChild className="mt-6 w-full sm:w-auto">
              <Link href={`/checkout/payment?orderId=${order.id}`}>Complete payment</Link>
            </Button>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2">
            {order.status !== 'PENDING' ? (
              <InvoiceButton orderId={order.id} email={order.guestEmail ?? undefined} />
            ) : null}
            {order.status === 'DELIVERED' && !returning ? (
              <Button variant="outline" size="sm" onClick={() => setReturning(true)}>
                <PackageOpen className="h-4 w-4" aria-hidden /> Request a return
              </Button>
            ) : null}
          </div>

          {returning ? (
            <div className="mt-6">
              <ReturnDialog
                orderId={order.id}
                email={order.guestEmail ?? undefined}
                onClose={() => setReturning(false)}
              />
            </div>
          ) : null}

          {canCancel ? (
            <div className="mt-6">
              {confirming ? (
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm">Cancel this order? Any payment taken is refunded.</p>
                  <Button variant="destructive" size="sm" loading={cancelOrder.isPending}
                    onClick={() => cancelOrder.mutate({ id: order.id, reason: 'Cancelled by customer' })}>
                    Yes, cancel
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep order</Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>Cancel order</Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {reviewing ? (
        <ReviewDialog
          open={Boolean(reviewing)}
          onOpenChange={(open) => !open && setReviewing(null)}
          productId={reviewing.productId}
          productName={reviewing.name}
        />
      ) : null}
    </div>
  );
}
