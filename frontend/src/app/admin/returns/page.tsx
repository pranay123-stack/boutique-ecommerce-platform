'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, PackageOpen, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  useAdminReturns,
  useInspectReturn,
  useUpdateReturnStatus,
} from '@/hooks/use-admin';
import { formatMoney, formatDate, humanizeStatus } from '@/lib/format';
import type { ReturnRequest, ReturnStatus } from '@/types';

const STATUSES: Array<{ value: string; label: string }> = [
  { value: '', label: 'All returns' },
  { value: 'REQUESTED', label: 'Awaiting review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PICKUP_SCHEDULED', label: 'Pickup scheduled' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'INSPECTED', label: 'Inspected' },
  { value: 'REFUNDED', label: 'Refunded' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Withdrawn' },
];

/** The transitions the API will accept, mirrored so the UI offers only those. */
const NEXT_STATUS: Partial<Record<ReturnStatus, ReturnStatus[]>> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PICKUP_SCHEDULED', 'RECEIVED'],
  PICKUP_SCHEDULED: ['IN_TRANSIT', 'RECEIVED'],
  IN_TRANSIT: ['RECEIVED'],
};

function InspectPanel({ request, onDone }: { request: ReturnRequest; onDone: () => void }) {
  const inspect = useInspectReturn();
  const [outcomes, setOutcomes] = useState<Record<string, boolean>>(
    Object.fromEntries(request.items.map((i) => [i.id, true])),
  );
  const [note, setNote] = useState('');

  const refundable = request.items
    .filter((i) => outcomes[i.id])
    .reduce((sum, i) => sum + Number(i.refundAmount), 0);

  return (
    <div className="mt-4 rounded-md border bg-muted/30 p-4">
      <h4 className="text-sm font-medium">Inspection</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Mark what can go back on sale. Anything unticked refunds nothing and is returned to the
        customer, and only ticked items are restocked.
      </p>

      <ul className="mt-3 space-y-2">
        {request.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-4 text-sm">
            <label className="flex flex-1 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={outcomes[item.id] ?? false}
                onChange={(e) =>
                  setOutcomes((o) => ({ ...o, [item.id]: e.target.checked }))
                }
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              <span>
                {item.quantity} × {item.orderItem?.productName ?? 'Item'}
                {item.orderItem?.variantName ? (
                  <span className="text-muted-foreground"> · {item.orderItem.variantName}</span>
                ) : null}
              </span>
            </label>
            <span className="tabular-nums text-muted-foreground">
              {formatMoney(item.refundAmount)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-2">
        <Label htmlFor={`note-${request.id}`}>Note</Label>
        <Input
          id={`note-${request.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Unworn, tags intact"
          maxLength={500}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Refundable:{' '}
          <span className="font-semibold tabular-nums">{formatMoney(refundable)}</span>
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={inspect.isPending}
            onClick={async () => {
              await inspect.mutateAsync({
                id: request.id,
                items: request.items.map((i) => ({
                  returnItemId: i.id,
                  restockable: outcomes[i.id] ?? false,
                })),
                staffNote: note || undefined,
              });
              onDone();
            }}
          >
            Record inspection
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminReturnsPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const { data, isLoading } = useAdminReturns({ page, status, search });
  const updateStatus = useUpdateReturnStatus();

  const returns = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display-heading text-3xl font-semibold">Returns</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve, receive and inspect items coming back. Stock only goes back on sale once you say
          it can.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Label htmlFor="return-search" className="sr-only">
            Search returns
          </Label>
          <Input
            id="return-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="RMA number, order number or email"
            className="pl-9"
          />
        </div>
        <Label htmlFor="return-status" className="sr-only">
          Filter by status
        </Label>
        <select
          id="return-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : returns.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <PackageOpen className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-4 text-sm text-muted-foreground">Nothing here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {returns.map((request) => {
            const next = NEXT_STATUS[request.status] ?? [];
            const customer =
              request.user?.email ?? request.guestEmail ?? 'Guest';
            return (
              <Card key={request.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-sm font-medium">{request.rmaNumber}</span>
                        <Badge
                          variant={
                            request.status === 'REFUNDED'
                              ? 'success'
                              : ['REJECTED', 'CANCELLED'].includes(request.status)
                                ? 'destructive'
                                : 'warning'
                          }
                        >
                          {humanizeStatus(request.status)}
                        </Badge>
                        <Badge variant="outline">{humanizeStatus(request.resolution)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {customer} ·{' '}
                        <Link
                          href={`/admin/orders/${request.orderId}`}
                          className="underline underline-offset-4"
                        >
                          {request.order?.orderNumber ?? 'order'}
                        </Link>{' '}
                        · opened {formatDate(request.createdAt)}
                      </p>
                      <p className="mt-2 text-sm">
                        <span className="text-muted-foreground">Reason:</span>{' '}
                        {humanizeStatus(request.reason)}
                      </p>
                      {request.customerNote ? (
                        <p className="mt-1 text-sm italic text-muted-foreground">
                          “{request.customerNote}”
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Refund</p>
                      <p className="font-semibold tabular-nums">
                        {formatMoney(request.refundAmount)}
                      </p>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {request.items.map((item) => (
                      <li key={item.id}>
                        {item.quantity} × {item.orderItem?.productName ?? 'Item'}
                        {item.restockable === true ? ' · restocked' : ''}
                        {item.restockable === false ? ' · failed inspection' : ''}
                      </li>
                    ))}
                  </ul>

                  {(next.length > 0 || request.status === 'RECEIVED') && <Separator className="my-4" />}

                  <div className="flex flex-wrap gap-2">
                    {next.map((target) => (
                      <Button
                        key={target}
                        size="sm"
                        variant={target === 'REJECTED' ? 'outline' : 'default'}
                        loading={updateStatus.isPending}
                        onClick={() => updateStatus.mutate({ id: request.id, status: target })}
                      >
                        {humanizeStatus(target)}
                      </Button>
                    ))}
                    {request.status === 'RECEIVED' && inspecting !== request.id ? (
                      <Button size="sm" onClick={() => setInspecting(request.id)}>
                        Inspect
                      </Button>
                    ) : null}
                  </div>

                  {inspecting === request.id ? (
                    <InspectPanel request={request} onDone={() => setInspecting(null)} />
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {data?.meta && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} returns
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!data.meta.hasPrevious}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.meta.hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
