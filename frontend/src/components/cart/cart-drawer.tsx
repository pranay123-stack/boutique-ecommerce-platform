'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, ShoppingBag, Trash2, AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useCart, useRemoveCartItem, useUpdateCartItem } from '@/hooks/use-cart';
import { formatMoney } from '@/lib/format';

export function CartDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: cart, isLoading } = useCart();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  const isEmpty = !isLoading && (!cart || cart.items.length === 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            Your bag {cart?.itemCount ? `(${cart.itemCount})` : ''}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-24 w-20 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center">
              <ShoppingBag className="h-12 w-12 text-muted-foreground/40" />
              <p className="mt-4 font-medium">Your bag is empty</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pieces you add will appear here.
              </p>
              <Button asChild className="mt-6" onClick={() => onOpenChange(false)}>
                <Link href="/products">Browse the collection</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-5">
              {cart!.items.map((item) => (
                <li key={item.id} className="flex gap-4">
                  <Link
                    href={`/products/${item.productSlug}`}
                    onClick={() => onOpenChange(false)}
                    className="relative h-24 w-20 shrink-0 overflow-hidden rounded-md bg-muted"
                  >
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.productName} fill sizes="80px" className="object-cover" />
                    ) : null}
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={`/products/${item.productSlug}`}
                      onClick={() => onOpenChange(false)}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {item.productName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{item.variantName}</p>

                    {item.hasStockIssue ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        Only {item.available} left
                      </p>
                    ) : null}

                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center rounded-md border border-border">
                        <button
                          type="button"
                          className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                          onClick={() => updateItem.mutate({ itemId: item.id, quantity: item.quantity - 1 })}
                          disabled={updateItem.isPending}
                          aria-label={`Decrease quantity of ${item.productName}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-8 text-center text-sm tabular-nums">{item.quantity}</span>
                        <button
                          type="button"
                          className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                          onClick={() => updateItem.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
                          disabled={updateItem.isPending || item.quantity >= item.available}
                          aria-label={`Increase quantity of ${item.productName}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium tabular-nums">{formatMoney(item.lineSubtotal)}</span>
                        <button
                          type="button"
                          onClick={() => removeItem.mutate(item.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${item.productName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!isEmpty && cart ? (
          <SheetFooter className="flex-col gap-3">
            <dl className="w-full space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(cart.subtotal)}</dd>
              </div>
              {Number(cart.discountTotal) > 0 ? (
                <div className="flex justify-between text-success">
                  <dt>Discount {cart.couponCode ? `(${cart.couponCode})` : ''}</dt>
                  <dd className="tabular-nums">−{formatMoney(cart.discountTotal)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="tabular-nums">
                  {Number(cart.shippingTotal) === 0 ? 'Free' : formatMoney(cart.shippingTotal)}
                </dd>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(cart.grandTotal)}</dd>
              </div>
            </dl>

            <Button asChild size="lg" className="w-full" onClick={() => onOpenChange(false)}>
              <Link href="/checkout">Checkout</Link>
            </Button>
            <Button asChild variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              <Link href="/cart">View full bag</Link>
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
