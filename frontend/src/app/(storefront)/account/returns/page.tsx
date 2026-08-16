'use client';

import Link from 'next/link';
import { Loader2, PackageOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCancelReturn, useMyReturns } from '@/hooks/use-returns';
import { formatMoney, formatDate, humanizeStatus } from '@/lib/format';
import type { ReturnStatus } from '@/types';

/** How each status should read to a customer, and how urgent it looks. */
const TONE: Record<ReturnStatus, { variant: 'default' | 'success' | 'warning' | 'destructive'; hint: string }> = {
  REQUESTED: { variant: 'warning', hint: 'We are reviewing your request.' },
  APPROVED: { variant: 'default', hint: 'Approved — we are arranging the pickup.' },
  PICKUP_SCHEDULED: { variant: 'default', hint: 'A courier will collect it shortly.' },
  IN_TRANSIT: { variant: 'default', hint: 'On its way back to us.' },
  RECEIVED: { variant: 'default', hint: 'It has reached us and is being checked.' },
  INSPECTED: { variant: 'default', hint: 'Checked — your refund is being processed.' },
  REFUNDED: { variant: 'success', hint: 'Refunded. Your bank may take a few days to show it.' },
  REJECTED: { variant: 'destructive', hint: 'This return was not accepted.' },
  CANCELLED: { variant: 'destructive', hint: 'You withdrew this return.' },
};

const WITHDRAWABLE: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED'];

export default function ReturnsPage() {
  const { data, isLoading } = useMyReturns();
  const cancelReturn = useCancelReturn();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const returns = data?.items ?? [];

  if (returns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <PackageOpen className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="mt-4 font-medium">No returns yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You can start a return from any delivered order.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/account/orders">View your orders</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="display-heading text-2xl font-semibold">Returns</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Track anything you have sent back to us.
        </p>
      </div>

      {returns.map((request) => {
        const tone = TONE[request.status];
        return (
          <Card key={request.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm font-medium">{request.rmaNumber}</span>
                    <Badge variant={tone.variant}>{humanizeStatus(request.status)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{tone.hint}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Opened {formatDate(request.createdAt)}
                    {request.order?.orderNumber ? (
                      <>
                        {' · '}
                        <Link
                          href={`/account/orders/${request.orderId}`}
                          className="underline underline-offset-4"
                        >
                          {request.order.orderNumber}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    {request.status === 'REFUNDED' ? 'Refunded' : 'Expected refund'}
                  </p>
                  <p className="font-semibold tabular-nums">{formatMoney(request.refundAmount)}</p>
                </div>
              </div>

              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                {request.items.map((item) => (
                  <li key={item.id}>
                    {item.quantity} ×{' '}
                    {item.orderItem?.productName ?? 'Item'}
                    {item.restockable === false ? (
                      <span className="ml-2 text-destructive">
                        — did not pass inspection, returning to you
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>

              {request.staffNote ? (
                <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm">{request.staffNote}</p>
              ) : null}

              {WITHDRAWABLE.includes(request.status) ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  loading={cancelReturn.isPending}
                  onClick={() => cancelReturn.mutate(request.id)}
                >
                  Withdraw this return
                </Button>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
