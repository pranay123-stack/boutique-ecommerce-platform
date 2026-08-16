'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatDate, humanizeStatus } from '@/lib/format';
import type { Order } from '@/types';

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOrder(null);
    try {
      const result = await api.get<Order>(
        `/orders/lookup/${encodeURIComponent(orderNumber.trim())}?email=${encodeURIComponent(email.trim())}`,
      );
      setOrder(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not find that order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-2xl py-16">
      <h1 className="display-heading text-4xl font-semibold">Track your order</h1>
      <p className="mt-2 text-muted-foreground">
        Enter your order number and the email used at checkout.
      </p>

      <Card className="mt-8">
        <CardContent className="p-6">
          <form onSubmit={lookup} className="space-y-4">
            <div>
              <Label htmlFor="orderNumber">Order number</Label>
              <Input id="orderNumber" required placeholder="BQ-20260816-XXXXXX"
                value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className="mt-1.5 font-mono" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              <Search className="h-4 w-4" /> Find my order
            </Button>
          </form>

          {error ? <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {order ? (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-mono text-base">{order.orderNumber}</CardTitle>
                <CardDescription>Placed {formatDate(order.placedAt)}</CardDescription>
              </div>
              <Badge>{humanizeStatus(order.status)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{order.items.length} item(s)</span>
              <span className="font-medium tabular-nums">{formatMoney(order.grandTotal)}</span>
            </div>

            {order.shipments?.length ? (
              order.shipments.map((shipment) => (
                <div key={shipment.id} className="rounded-md border border-border p-4 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <Package className="h-4 w-4" /> {shipment.courierName ?? 'Courier'}
                  </p>
                  {shipment.awbCode ? <p className="mt-1 text-muted-foreground">AWB {shipment.awbCode}</p> : null}
                  <p className="mt-1 text-muted-foreground">{humanizeStatus(shipment.status)}</p>
                  {shipment.trackingUrl ? (
                    <a href={shipment.trackingUrl} target="_blank" rel="noreferrer noopener"
                      className="mt-2 inline-block text-primary underline">
                      Track with courier
                    </a>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Not dispatched yet. You&apos;ll get tracking details by email once it ships.
              </p>
            )}

            <Button asChild variant="outline" className="w-full">
              <Link href={`/order-confirmation/${order.id}?email=${encodeURIComponent(email)}`}>
                View full order
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
