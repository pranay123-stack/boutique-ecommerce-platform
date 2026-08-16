'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Package, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrders } from '@/hooks/use-orders';
import { formatMoney, formatDate, humanizeStatus } from '@/lib/format';
import type { OrderStatus } from '@/types';

const STATUS_VARIANT: Record<OrderStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  PENDING: 'warning',
  PAYMENT_CONFIRMED: 'default',
  PROCESSING: 'default',
  PACKED: 'default',
  SHIPPED: 'default',
  DELIVERED: 'success',
  CANCELLED: 'destructive',
  RETURNED: 'secondary',
  REFUNDED: 'secondary',
};

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useOrders(page);

  if (isLoading) {
    return <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;
  }

  if (!data?.items.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground/30" />
          <h2 className="mt-4 font-medium">No orders yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your orders will appear here.</p>
          <Button asChild className="mt-6"><Link href="/products">Start shopping</Link></Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.items.map((order) => (
        <Card key={order.id}>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/account/orders/${order.id}`} className="font-mono text-sm font-medium hover:underline">
                  {order.orderNumber}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(order.placedAt)}</p>
              </div>
              <Badge variant={STATUS_VARIANT[order.status] ?? 'default'}>
                {humanizeStatus(order.status)}
              </Badge>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex -space-x-3">
                {order.items.slice(0, 4).map((item) => (
                  <div key={item.id} className="relative h-14 w-11 overflow-hidden rounded border-2 border-background bg-muted">
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt="" fill sizes="44px" className="object-cover" />
                    ) : null}
                  </div>
                ))}
                {order.items.length > 4 ? (
                  <div className="flex h-14 w-11 items-center justify-center rounded border-2 border-background bg-muted text-xs">
                    +{order.items.length - 4}
                  </div>
                ) : null}
              </div>

              <div className="ml-auto flex items-center gap-4">
                <span className="font-medium tabular-nums">{formatMoney(order.grandTotal)}</span>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/account/orders/${order.id}`}>
                    Details <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button variant="outline" size="sm" disabled={!data.meta.hasPrevious} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {data.meta.page} of {data.meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
