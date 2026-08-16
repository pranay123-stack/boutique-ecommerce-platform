'use client';

import { useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdjustStock, useLowStock } from '@/hooks/use-admin';

export default function InventoryPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useLowStock(page);
  const adjustStock = useAdjustStock();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">Variants at or below their reorder threshold</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-warning" /> Low stock
          </CardTitle>
          <CardDescription>
            Set an absolute quantity. Adjustments are recorded in the inventory history.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !data?.items.length ? (
            <p className="flex items-center justify-center gap-2 p-12 text-sm text-success">
              <Check className="h-4 w-4" /> Every variant is above its threshold.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>On hand</TableHead>
                  <TableHead>Reserved</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Threshold</TableHead>
                  <TableHead className="text-right">Set quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm">
                      <p className="font-medium">{row.variant?.product?.name}</p>
                      <p className="text-xs text-muted-foreground">{row.variant?.name}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.variant?.sku}</TableCell>
                    <TableCell className="tabular-nums">{row.quantity}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{row.reservedQuantity}</TableCell>
                    <TableCell>
                      <Badge variant={row.available === 0 ? 'destructive' : 'warning'}>{row.available}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{row.lowStockThreshold}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Input
                          type="number"
                          min={0}
                          className="h-9 w-24"
                          placeholder={String(row.quantity)}
                          aria-label={`New quantity for ${row.variant?.sku}`}
                          value={drafts[row.variantId] ?? ''}
                          onChange={(e) => setDrafts({ ...drafts, [row.variantId]: e.target.value })}
                        />
                        <Button
                          size="sm"
                          disabled={!drafts[row.variantId]}
                          loading={adjustStock.isPending}
                          onClick={() =>
                            adjustStock.mutate(
                              {
                                variantId: row.variantId,
                                quantity: Number(drafts[row.variantId]),
                                reason: 'Restocked from admin console',
                              },
                              { onSuccess: () => setDrafts({ ...drafts, [row.variantId]: '' }) },
                            )
                          }
                        >
                          Save
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

      {data && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={!data.meta.hasPrevious} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {data.meta.page} of {data.meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}
