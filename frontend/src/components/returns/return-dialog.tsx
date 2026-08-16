'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useCreateReturn, useReturnEligibility } from '@/hooks/use-returns';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Mirrors RETURN_REASONS on the API. */
const REASONS: Array<{ value: string; label: string }> = [
  { value: 'DOES_NOT_FIT', label: 'It does not fit' },
  { value: 'NOT_AS_DESCRIBED', label: 'Not as described' },
  { value: 'DAMAGED_OR_DEFECTIVE', label: 'Arrived damaged or faulty' },
  { value: 'WRONG_ITEM_SENT', label: 'The wrong item was sent' },
  { value: 'ARRIVED_LATE', label: 'It arrived too late' },
  { value: 'CHANGED_MIND', label: 'I changed my mind' },
  { value: 'OTHER', label: 'Something else' },
];

/** Reasons where we pay the return shipping. Mirrors MERCHANT_FAULT_REASONS. */
const OUR_FAULT = new Set(['DAMAGED_OR_DEFECTIVE', 'WRONG_ITEM_SENT', 'NOT_AS_DESCRIBED']);

export function ReturnDialog({
  orderId,
  email,
  onClose,
}: {
  orderId: string;
  email?: string;
  onClose: () => void;
}) {
  const { data: eligibility, isLoading } = useReturnEligibility(orderId, email);
  const createReturn = useCreateReturn();

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState<'REFUND' | 'EXCHANGE'>('REFUND');

  const selected = useMemo(
    () => Object.entries(quantities).filter(([, qty]) => qty > 0),
    [quantities],
  );

  const refundEstimate = useMemo(() => {
    if (!eligibility) return 0;
    return selected.reduce((sum, [orderItemId, qty]) => {
      const item = eligibility.items.find((i) => i.orderItemId === orderItemId);
      return sum + (item ? Number(item.refundPerUnit) * qty : 0);
    }, 0);
  }, [eligibility, selected]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!eligibility?.eligible) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <div className="flex gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-200">
              This order cannot be returned
            </p>
            <p className="mt-1 text-amber-800 dark:text-amber-300">
              {eligibility?.reason ?? 'No returnable items remain on this order.'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="mt-4" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  const submit = async () => {
    await createReturn.mutateAsync({
      orderId,
      reason,
      resolution,
      customerNote: note || undefined,
      guestEmail: email,
      items: selected.map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
    });
    onClose();
  };

  const returnable = eligibility.items.filter((i) => i.returnableQuantity > 0);

  return (
    <div className="space-y-6 rounded-lg border p-5">
      <div>
        <h3 className="display-heading flex items-center gap-2 text-lg font-semibold">
          <PackageOpen className="h-4 w-4" aria-hidden /> Return items
        </h3>
        {eligibility.closesAt ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Your {eligibility.windowDays}-day window closes on{' '}
            {new Date(eligibility.closesAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            .
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">What are you sending back?</legend>
        {returnable.map((item) => {
          const qty = quantities[item.orderItemId] ?? 0;
          return (
            <div
              key={item.orderItemId}
              className={cn(
                'flex items-center justify-between gap-4 rounded-md border p-3 transition-colors',
                qty > 0 && 'border-primary bg-primary/5',
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.variantName ? `${item.variantName} · ` : ''}
                  {formatMoney(item.refundPerUnit)} each
                  {item.returnedQuantity > 0
                    ? ` · ${item.returnedQuantity} already returned`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`qty-${item.orderItemId}`} className="sr-only">
                  Quantity of {item.productName} to return
                </Label>
                <select
                  id={`qty-${item.orderItemId}`}
                  value={qty}
                  onChange={(e) =>
                    setQuantities((q) => ({ ...q, [item.orderItemId]: Number(e.target.value) }))
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {Array.from({ length: item.returnableQuantity + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="return-reason">Why are you returning it?</Label>
        <select
          id="return-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Choose a reason…</option>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {reason && !OUR_FAULT.has(reason) ? (
          <p className="text-xs text-muted-foreground">
            Delivery charges are refunded only when the fault is ours, so this return refunds the
            price of the goods.
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">What would you like instead?</legend>
        <div className="flex gap-3">
          {(
            [
              { value: 'REFUND' as const, label: 'A refund' },
              { value: 'EXCHANGE' as const, label: 'An exchange' },
            ]
          ).map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex flex-1 cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition-colors',
                resolution === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
              )}
            >
              <input
                type="radio"
                name="resolution"
                value={option.value}
                checked={resolution === option.value}
                onChange={() => setResolution(option.value)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="return-note">
          Anything else we should know? <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="return-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="A photograph helps if something arrived damaged — email it to us and quote your RMA number."
        />
      </div>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm">
          <span className="text-muted-foreground">Estimated refund</span>{' '}
          <span className="font-semibold tabular-nums">{formatMoney(refundEstimate)}</span>
          <p className="text-xs text-muted-foreground">
            Confirmed once we have inspected the items.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={selected.length === 0 || !reason}
            loading={createReturn.isPending}
          >
            Request return
          </Button>
        </div>
      </div>
    </div>
  );
}
