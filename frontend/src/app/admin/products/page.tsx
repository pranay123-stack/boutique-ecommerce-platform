'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, Plus, Trash2, AlertTriangle, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminProducts, useDeleteProduct } from '@/hooks/use-admin';
import { formatMoney } from '@/lib/format';

export default function AdminProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading } = useAdminProducts({ page, search: search || undefined });
  const deleteProduct = useDeleteProduct();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Button asChild><Link href="/admin/products/new"><Plus className="h-4 w-4" /> New product</Link></Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or SKU"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
              aria-label="Search products"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !data?.items.length ? (
            <p className="p-12 text-center text-sm text-muted-foreground">No products found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Variants</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-10 shrink-0 overflow-hidden rounded bg-muted">
                          {product.images?.[0]?.url ? (
                            <Image src={product.images[0].url} alt="" fill sizes="40px" className="object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.brand}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{product.category?.name}</TableCell>
                    <TableCell className="text-sm tabular-nums">{formatMoney(product.basePrice)}</TableCell>
                    <TableCell className="text-sm tabular-nums">{product.variants?.length ?? 0}</TableCell>
                    <TableCell>
                      <span className={`text-sm tabular-nums ${product.lowStock ? 'font-medium text-warning' : ''}`}>
                        {product.lowStock ? <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> : null}
                        {product.totalStock}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.status === 'ACTIVE' ? 'success' : product.status === 'DRAFT' ? 'warning' : 'secondary'}>
                        {product.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" asChild aria-label="Edit product">
                          <Link href={`/admin/products/${product.id}`}><Pencil className="h-4 w-4" /></Link>
                        </Button>
                        <Button
                          variant="ghost" size="icon" aria-label="Archive product"
                          onClick={() => {
                            if (confirm(`Archive "${product.name}"?`)) deleteProduct.mutate(product.id);
                          }}
                        >
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
