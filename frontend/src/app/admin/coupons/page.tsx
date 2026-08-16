'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCoupons, useDeleteCoupon, useSaveCoupon } from '@/hooks/use-admin';
import { formatMoney, formatDate } from '@/lib/format';

const EMPTY = {
  code: '', description: '', type: 'PERCENTAGE', value: '',
  minOrderValue: '0', maxDiscountAmount: '', usageLimit: '', usageLimitPerUser: '1', expiresAt: '',
};

export default function CouponsPage() {
  const { data, isLoading } = useAdminCoupons();
  const saveCoupon = useSaveCoupon();
  const deleteCoupon = useDeleteCoupon();
  const [editing, setEditing] = useState<typeof EMPTY & { id?: string } | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    saveCoupon.mutate(
      {
        ...(editing.id ? { id: editing.id } : {}),
        code: editing.code.toUpperCase(),
        description: editing.description || undefined,
        type: editing.type,
        value: Number(editing.value || 0),
        minOrderValue: Number(editing.minOrderValue || 0),
        maxDiscountAmount: editing.maxDiscountAmount ? Number(editing.maxDiscountAmount) : undefined,
        usageLimit: editing.usageLimit ? Number(editing.usageLimit) : undefined,
        usageLimitPerUser: Number(editing.usageLimitPerUser || 1),
        expiresAt: editing.expiresAt ? new Date(editing.expiresAt).toISOString() : undefined,
      },
      { onSuccess: () => setEditing(null) },
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Coupons</h1>
        <Button onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4" /> New coupon</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !data?.items.length ? (
            <p className="p-12 text-center text-sm text-muted-foreground">No coupons yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Min order</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((coupon: any) => (
                  <TableRow key={coupon.id}>
                    <TableCell className="font-mono text-sm font-medium">{coupon.code}</TableCell>
                    <TableCell className="text-sm">{coupon.type.replace('_', ' ').toLowerCase()}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {coupon.type === 'PERCENTAGE' ? `${coupon.value}%` : coupon.type === 'FREE_SHIPPING' ? '—' : formatMoney(coupon.value)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{formatMoney(coupon.minOrderValue)}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {coupon.usedCount}{coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {coupon.expiresAt ? formatDate(coupon.expiresAt) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={coupon.isActive ? 'success' : 'secondary'}>
                        {coupon.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" aria-label="Edit coupon"
                          onClick={() => setEditing({
                            id: coupon.id, code: coupon.code, description: coupon.description ?? '',
                            type: coupon.type, value: String(coupon.value),
                            minOrderValue: String(coupon.minOrderValue),
                            maxDiscountAmount: coupon.maxDiscountAmount ? String(coupon.maxDiscountAmount) : '',
                            usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : '',
                            usageLimitPerUser: String(coupon.usageLimitPerUser ?? 1),
                            expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : '',
                          })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Delete coupon"
                          onClick={() => { if (confirm(`Delete ${coupon.code}?`)) deleteCoupon.mutate(coupon.id); }}>
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit coupon' : 'New coupon'}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="code">Code</Label>
              <Input id="code" required className="mt-1.5 font-mono uppercase" value={editing?.code ?? ''}
                onChange={(e) => setEditing((c) => (c ? { ...c, code: e.target.value.toUpperCase() } : c))} />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Input id="description" className="mt-1.5" value={editing?.description ?? ''}
                onChange={(e) => setEditing((c) => (c ? { ...c, description: e.target.value } : c))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type">Type</Label>
                <Select value={editing?.type} onValueChange={(v) => setEditing((c) => (c ? { ...c, type: v } : c))}>
                  <SelectTrigger id="type" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                    <SelectItem value="FIXED">Fixed amount</SelectItem>
                    <SelectItem value="FREE_SHIPPING">Free shipping</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="value">Value</Label>
                <Input id="value" type="number" step="0.01" className="mt-1.5" value={editing?.value ?? ''}
                  onChange={(e) => setEditing((c) => (c ? { ...c, value: e.target.value } : c))} />
              </div>
              <div>
                <Label htmlFor="minOrderValue">Min order value</Label>
                <Input id="minOrderValue" type="number" step="0.01" className="mt-1.5" value={editing?.minOrderValue ?? ''}
                  onChange={(e) => setEditing((c) => (c ? { ...c, minOrderValue: e.target.value } : c))} />
              </div>
              <div>
                <Label htmlFor="maxDiscountAmount">Max discount</Label>
                <Input id="maxDiscountAmount" type="number" step="0.01" className="mt-1.5" value={editing?.maxDiscountAmount ?? ''}
                  onChange={(e) => setEditing((c) => (c ? { ...c, maxDiscountAmount: e.target.value } : c))} />
              </div>
              <div>
                <Label htmlFor="usageLimit">Total uses</Label>
                <Input id="usageLimit" type="number" className="mt-1.5" value={editing?.usageLimit ?? ''}
                  onChange={(e) => setEditing((c) => (c ? { ...c, usageLimit: e.target.value } : c))} />
              </div>
              <div>
                <Label htmlFor="usageLimitPerUser">Uses per customer</Label>
                <Input id="usageLimitPerUser" type="number" className="mt-1.5" value={editing?.usageLimitPerUser ?? ''}
                  onChange={(e) => setEditing((c) => (c ? { ...c, usageLimitPerUser: e.target.value } : c))} />
              </div>
            </div>
            <div>
              <Label htmlFor="expiresAt">Expires</Label>
              <Input id="expiresAt" type="date" className="mt-1.5" value={editing?.expiresAt ?? ''}
                onChange={(e) => setEditing((c) => (c ? { ...c, expiresAt: e.target.value } : c))} />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" loading={saveCoupon.isPending}>Save coupon</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
