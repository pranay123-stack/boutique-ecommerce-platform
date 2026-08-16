'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Truck, RotateCcw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminOrder, useCreateShipment, useRefundOrder, useUpdateOrderStatus } from '@/hooks/use-admin';
import { formatMoney, formatDateTime, humanizeStatus } from '@/lib/format';

/** Mirrors the server-side state machine so the UI only offers legal moves. */
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PAYMENT_CONFIRMED', 'CANCELLED'],
  PAYMENT_CONFIRMED: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
  PROCESSING: ['PACKED', 'CANCELLED', 'REFUNDED'],
  PACKED: ['SHIPPED', 'CANCELLED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  RETURNED: ['REFUNDED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

export default function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: order, isLoading } = useAdminOrder(id);
  const updateStatus = useUpdateOrderStatus();
  const createShipment = useCreateShipment();
  const refundOrder = useRefundOrder();
  const [nextStatus, setNextStatus] = useState('');
  const [refundAmount, setRefundAmount] = useState('');

  if (isLoading || !order) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const allowed = TRANSITIONS[order.status] ?? [];
  const canShip = order.paymentStatus === 'CAPTURED' && !order.shipments?.length;
  const refunded = (order.refunds ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const refundable = Number(order.grandTotal) - refunded;

  return (
    <div className="space-y-5">
      <Button variant="ghost" asChild className="-ml-3">
        <Link href="/admin/orders"><ArrowLeft className="h-4 w-4" /> All orders</Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(order.placedAt)}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={order.status === 'DELIVERED' ? 'success' : 'secondary'}>{humanizeStatus(order.status)}</Badge>
          <Badge variant={order.paymentStatus === 'CAPTURED' ? 'success' : 'warning'}>{humanizeStatus(order.paymentStatus)}</Badge>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Items</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.variantName} · SKU {item.sku} · ×{item.quantity}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums">{formatMoney(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <Separator className="my-4" />
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatMoney(order.subtotal)}</dd></div>
                {Number(order.discountTotal) > 0 ? (
                  <div className="flex justify-between text-success"><dt>Discount {order.couponCode}</dt><dd className="tabular-nums">−{formatMoney(order.discountTotal)}</dd></div>
                ) : null}
                <div className="flex justify-between"><dt className="text-muted-foreground">Tax</dt><dd className="tabular-nums">{formatMoney(order.taxTotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="tabular-nums">{formatMoney(order.shippingTotal)}</dd></div>
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(order.grandTotal)}</dd></div>
                {refunded > 0 ? (
                  <div className="flex justify-between text-destructive"><dt>Refunded</dt><dd className="tabular-nums">−{formatMoney(refunded)}</dd></div>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-3 border-l border-border pl-4">
                {order.statusHistory?.map((event) => (
                  <li key={event.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <p className="font-medium">
                      {event.fromStatus ? `${humanizeStatus(event.fromStatus)} → ` : ''}{humanizeStatus(event.toStatus)}
                    </p>
                    {event.note ? <p className="text-muted-foreground">{event.note}</p> : null}
                    <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fulfilment</CardTitle>
              <CardDescription>Advance the order</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {allowed.length ? (
                <>
                  <Select value={nextStatus} onValueChange={setNextStatus}>
                    <SelectTrigger aria-label="New status"><SelectValue placeholder="Choose a status" /></SelectTrigger>
                    <SelectContent>
                      {allowed.map((s) => <SelectItem key={s} value={s}>{humanizeStatus(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    className="w-full"
                    disabled={!nextStatus}
                    loading={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ id, status: nextStatus }, { onSuccess: () => setNextStatus('') })}
                  >
                    Update status
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">This order has reached a final state.</p>
              )}

              {canShip ? (
                <Button variant="outline" className="w-full" loading={createShipment.isPending} onClick={() => createShipment.mutate(id)}>
                  <Truck className="h-4 w-4" /> Book shipment
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {order.paymentStatus === 'CAPTURED' && refundable > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Refund</CardTitle>
                <CardDescription>{formatMoney(refundable)} remaining</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="refundAmount">Amount</Label>
                  <Input
                    id="refundAmount" type="number" step="0.01" max={refundable}
                    value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder={String(refundable.toFixed(2))} className="mt-1.5"
                  />
                </div>
                <Button
                  variant="destructive" className="w-full"
                  loading={refundOrder.isPending}
                  disabled={!refundAmount || Number(refundAmount) <= 0 || Number(refundAmount) > refundable}
                  onClick={() => refundOrder.mutate(
                    { orderId: id, amount: Number(refundAmount), reason: 'Admin-issued refund' },
                    { onSuccess: () => setRefundAmount('') },
                  )}
                >
                  <RotateCcw className="h-4 w-4" /> Issue refund
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">
                  {order.user ? `${order.user.firstName} ${order.user.lastName ?? ''}` : 'Guest'}
                </p>
                <p className="text-muted-foreground">{order.user?.email ?? order.guestEmail}</p>
              </div>
              <Separator />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Ship to</p>
                <address className="mt-1 not-italic leading-relaxed text-muted-foreground">
                  {order.shippingAddress.fullName}<br />
                  {order.shippingAddress.line1}<br />
                  {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}<br />
                  {order.shippingAddress.phone}
                </address>
              </div>
            </CardContent>
          </Card>

          {order.shipments?.length ? (
            <Card>
              <CardHeader><CardTitle className="text-base">Shipment</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {order.shipments.map((s) => (
                  <div key={s.id}>
                    <p className="font-medium">{s.courierName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{s.awbCode}</p>
                    <Badge variant="outline" className="mt-1">{humanizeStatus(s.status)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
