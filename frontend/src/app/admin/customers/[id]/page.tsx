'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Mail, Phone, MapPin, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatDate, humanizeStatus } from '@/lib/format';

export default function AdminCustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: () => api.get<any>(`/admin/customers/${id}`),
  });

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/admin/customers/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'customer', id] });
      void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
      toast.success('Customer updated');
    },
    onError: (e: ApiError) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const stats = data.stats ?? {};

  return (
    <div className="space-y-5">
      <Button variant="ghost" asChild className="-ml-3">
        <Link href="/admin/customers"><ArrowLeft className="h-4 w-4" /> Customers</Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {data.firstName} {data.lastName ?? ''}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {data.email}</span>
            {data.phone ? <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {data.phone}</span> : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={data.emailVerified ? 'success' : 'warning'}>
            {data.emailVerified ? 'Email verified' : 'Unverified'}
          </Badge>
          <Badge variant={data.status === 'ACTIVE' ? 'success' : 'destructive'}>{data.status}</Badge>
          <Badge variant="outline">{data.role?.name}</Badge>
        </div>
      </div>

      {/* Lifetime value */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Lifetime value', formatMoney(stats.lifetimeValue)],
          ['Paid orders', String(stats.paidOrderCount ?? 0)],
          ['Average order', formatMoney(stats.averageOrderValue)],
          ['Customer since', formatDate(data.createdAt)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="h-4 w-4" /> Recent orders
            </CardTitle>
            <CardDescription>Most recent 20</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.orders?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.orders.map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs hover:underline">
                          {o.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(o.createdAt)}</TableCell>
                      <TableCell className="tabular-nums">{o._count?.items ?? 0}</TableCell>
                      <TableCell><Badge variant="secondary">{humanizeStatus(o.status)}</Badge></TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(o.grandTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">No orders yet.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base">Account status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={status || data.status} onValueChange={setStatus}>
                <SelectTrigger aria-label="Account status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                </SelectContent>
              </Select>
              <Button
                className="w-full"
                disabled={!status || status === data.status}
                loading={update.isPending}
                onClick={() => update.mutate({ status })}
              >
                Update status
              </Button>
              <p className="text-xs text-muted-foreground">
                Suspending revokes every active session immediately.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" /> Addresses
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {data.addresses?.length ? (
                data.addresses.map((a: any) => (
                  <div key={a.id}>
                    <p className="font-medium">{a.label ?? a.fullName}</p>
                    <address className="mt-0.5 not-italic leading-relaxed text-muted-foreground">
                      {a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />
                      {a.city}, {a.state} {a.postalCode}<br />
                      {a.phone}
                    </address>
                    <Separator className="mt-3" />
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">No saved addresses.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
