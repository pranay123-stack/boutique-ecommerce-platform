'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminOrders } from '@/hooks/use-admin';
import { formatMoney, formatDate, humanizeStatus } from '@/lib/format';

const STATUSES = [
  'PENDING', 'PAYMENT_CONFIRMED', 'PROCESSING', 'PACKED',
  'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED',
];

function OrdersInner() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const { data, isLoading } = useAdminOrders({
    page,
    search: search || undefined,
    status: status === 'all' ? undefined : status,
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Orders</h1>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Order number, email or name"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
                aria-label="Search orders"
              />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-52" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{humanizeStatus(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !data?.items.length ? (
            <p className="p-12 text-center text-sm text-muted-foreground">No orders match those filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs font-medium hover:underline">
                        {order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-sm">
                      {order.user ? `${order.user.firstName} ${order.user.lastName ?? ''}` : (order.guestEmail ?? 'Guest')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(order.placedAt)}</TableCell>
                    <TableCell className="text-sm tabular-nums">{order.items?.length ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={order.status === 'DELIVERED' ? 'success' : order.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
                        {humanizeStatus(order.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={order.paymentStatus === 'CAPTURED' ? 'success' : order.paymentStatus === 'FAILED' ? 'destructive' : 'warning'}>
                        {humanizeStatus(order.paymentStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(order.grandTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={!data.meta.hasPrevious} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} orders</span>
          <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminOrdersPage() {
  return <Suspense fallback={<Skeleton className="h-96 w-full" />}><OrdersInner /></Suspense>;
}
