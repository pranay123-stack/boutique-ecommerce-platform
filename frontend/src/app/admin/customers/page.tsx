'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminCustomers } from '@/hooks/use-admin';
import { formatDate } from '@/lib/format';

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading } = useAdminCustomers({ page, search: search || undefined });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Customers</h1>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email or phone"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
              aria-label="Search customers"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !data?.items.length ? (
            <p className="p-12 text-center text-sm text-muted-foreground">No customers found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((customer: any) => (
                  <TableRow key={customer.id}>
                    <TableCell className="text-sm font-medium">
                      <Link href={`/admin/customers/${customer.id}`} className="hover:underline">
                        {customer.firstName} {customer.lastName ?? ''}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{customer.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{customer.phone ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{customer._count?.orders ?? 0}</TableCell>
                    <TableCell><Badge variant="outline">{customer.role?.name}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={customer.status === 'ACTIVE' ? 'success' : 'destructive'}>
                        {customer.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(customer.createdAt)}</TableCell>
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
