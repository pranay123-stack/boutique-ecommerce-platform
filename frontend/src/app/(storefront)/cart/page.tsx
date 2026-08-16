'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, Trash2, ShoppingBag, Tag, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useApplyCoupon, useCart, useRemoveCartItem, useRemoveCoupon, useUpdateCartItem } from '@/hooks/use-cart';
import { formatMoney } from '@/lib/format';

export default function CartPage() {
  const { data: cart, isLoading } = useCart();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const applyCoupon = useApplyCoupon();
  const removeCoupon = useRemoveCoupon();
  const [code, setCode] = useState('');

  if (isLoading) {
    return (
      <div className="container py-12">
        <Skeleton className="h-10 w-48" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {[0, 1].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container flex flex-col items-center py-28 text-center">
        <ShoppingBag className="h-14 w-14 text-muted-foreground/30" />
        <h1 className="display-heading mt-6 text-3xl font-semibold">Your bag is empty</h1>
        <p className="mt-2 max-w-sm text-muted-foreground">
          Nothing here yet. Have a look through the collection.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/products">Browse the collection</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-12">
      <h1 className="display-heading text-4xl font-semibold">Your bag</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {cart.itemCount} item{cart.itemCount === 1 ? '' : 's'}
      </p>

      {cart.hasStockIssues ? (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Some items are no longer fully available</p>
            <p className="mt-0.5 text-muted-foreground">
              Adjust the highlighted quantities below before checking out.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <ul className="space-y-6">
          {cart.items.map((item) => (
            <li key={item.id} className="flex gap-5 border-b border-border pb-6">
              <Link
                href={`/products/${item.productSlug}`}
                className="relative h-36 w-28 shrink-0 overflow-hidden rounded-lg bg-muted"
              >
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt={item.productName} fill sizes="112px" className="object-cover" />
                ) : null}
              </Link>

              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/products/${item.productSlug}`} className="font-medium hover:underline">
                      {item.productName}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.variantName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">SKU {item.sku}</p>
                  </div>
                  <span className="whitespace-nowrap font-medium tabular-nums">
                    {formatMoney(item.lineSubtotal)}
                  </span>
                </div>

                {item.hasStockIssue ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Only {item.available} available
                  </p>
                ) : null}

                <div className="mt-auto flex items-center justify-between pt-4">
                  <div className="flex items-center rounded-md border border-border">
                    <button
                      type="button"
                      className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      onClick={() => updateItem.mutate({ itemId: item.id, quantity: item.quantity - 1 })}
                      disabled={updateItem.isPending}
                      aria-label={`Decrease quantity of ${item.productName}`}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-10 text-center text-sm tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      onClick={() => updateItem.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
                      disabled={updateItem.isPending || item.quantity >= item.available}
                      aria-label={`Increase quantity of ${item.productName}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem.mutate(item.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Summary */}
        <div className="lg:sticky lg:top-28 lg:h-fit">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-medium">Order summary</h2>

              {cart.coupon ? (
                <div className="flex items-center justify-between rounded-md bg-success/10 p-3 text-sm">
                  <span className="flex items-center gap-2 font-medium text-success">
                    <Tag className="h-4 w-4" /> {cart.coupon.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCoupon.mutate()}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (code.trim()) applyCoupon.mutate(code.trim().toUpperCase());
                  }}
                >
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Discount code"
                    aria-label="Discount code"
                    className="uppercase"
                  />
                  <Button type="submit" variant="outline" loading={applyCoupon.isPending}>
                    Apply
                  </Button>
                </form>
              )}

              <Separator />

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(cart.subtotal)}</dd>
                </div>
                {Number(cart.discountTotal) > 0 ? (
                  <div className="flex justify-between text-success">
                    <dt>Discount</dt>
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
                {/*
                  Prices include GST, so the tax is stated, not added. Listing
                  it as a line above the total would charge for it twice.
                */}
                <p className="pt-1 text-xs text-muted-foreground">
                  Inclusive of {formatMoney(cart.taxTotal)} GST
                </p>
              </dl>

              <Button asChild size="lg" className="w-full" disabled={cart.hasStockIssues}>
                <Link href="/checkout">
                  Proceed to checkout <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link href="/products">Continue shopping</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
