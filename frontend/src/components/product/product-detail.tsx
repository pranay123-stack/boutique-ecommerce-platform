'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { PhotoCredit } from './photo-credit';
import Link from 'next/link';
import { Heart, Minus, Plus, ShoppingBag, Star, Truck, RefreshCw, ShieldCheck, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAddToCart } from '@/hooks/use-cart';
import { useToggleWishlist, useWishlist } from '@/hooks/use-account';
import { useAuthStore } from '@/store/auth-store';
import { useUIStore } from '@/store/ui-store';
import { formatMoney, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';

export function ProductDetail({ product }: { product: Product }) {
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    // Preselect the first in-stock variant so a single-variant product is
    // immediately purchasable without an extra click.
    const first = product.variants.find((v) => v.inStock) ?? product.variants[0];
    const initial: Record<string, string> = {};
    first?.attributes?.forEach((attr) => {
      initial[attr.name] = attr.slug;
    });
    return initial;
  });

  const addToCart = useAddToCart();
  const user = useAuthStore((s) => s.user);
  const { data: wishlist } = useWishlist(Boolean(user));
  const toggleWishlist = useToggleWishlist();
  const setCartOpen = useUIStore((s) => s.setCartOpen);

  const isSaved = wishlist?.items.some((i) => i.productId === product.id) ?? false;

  /** The variant matching every currently selected option, if one exists. */
  const activeVariant = useMemo(() => {
    if (!product.options?.length) return product.variants[0];
    return product.variants.find((variant) =>
      variant.attributes?.every((attr) => selected[attr.name] === attr.slug) &&
      Object.keys(selected).length === (variant.attributes?.length ?? 0),
    );
  }, [product, selected]);

  /**
   * Which option values can still be reached given the current selection.
   * Greying out impossible combinations prevents the classic dead-end where a
   * shopper picks a colour and size that simply do not exist together.
   */
  const availableFor = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const option of product.options ?? []) {
      const others = Object.entries(selected).filter(([name]) => name !== option.name);
      const reachable = new Set<string>();
      for (const variant of product.variants) {
        const matchesOthers = others.every(([name, slug]) =>
          variant.attributes?.some((a) => a.name === name && a.slug === slug),
        );
        if (!matchesOthers) continue;
        variant.attributes
          ?.filter((a) => a.name === option.name)
          .forEach((a) => {
            if (variant.available > 0) reachable.add(a.slug);
          });
      }
      map[option.name] = reachable;
    }
    return map;
  }, [product, selected]);

  const images = product.images?.length ? product.images : [];
  const price = activeVariant
    ? Number(activeVariant.discountPrice ?? activeVariant.price)
    : Number(product.basePrice);
  const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const available = activeVariant?.available ?? 0;
  const rating = Number(product.ratingAverage);

  const handleAdd = () => {
    if (!activeVariant) return;
    addToCart.mutate(
      { variantId: activeVariant.id, quantity },
      { onSuccess: () => setCartOpen(true) },
    );
  };

  return (
    <div className="container py-10">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Gallery */}
        <div className="space-y-4">
          <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted">
            {images[activeImage] ? (
              <Image
                src={images[activeImage].url}
                alt={images[activeImage].alt ?? product.name}
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            ) : null}
            {product.discountPercent && product.discountPercent > 0 ? (
              <Badge variant="destructive" className="absolute left-4 top-4">
                −{product.discountPercent}%
              </Badge>
            ) : null}
          </div>

          {images.length > 1 ? (
            <div className="flex gap-3" role="tablist" aria-label="Product images">
              {images.map((image, i) => (
                <button
                  key={image.id ?? i}
                  role="tab"
                  aria-selected={i === activeImage}
                  aria-label={`View image ${i + 1}`}
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    'relative h-20 w-16 overflow-hidden rounded-md border-2 transition-colors',
                    i === activeImage ? 'border-primary' : 'border-transparent hover:border-border',
                  )}
                >
                  <Image src={image.thumbnailUrl ?? image.url} alt="" fill sizes="64px" className="object-cover" />
                </button>
              ))}
            </div>
          ) : null}

          {/*
            Attribution for demo photography. Renders nothing once the
            merchant's own product photographs replace the placeholders.
          */}
          <PhotoCredit url={images[activeImage]?.url} />
        </div>

        {/* Purchase panel */}
        <div>
          {product.brand ? (
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{product.brand}</p>
          ) : null}
          <h1 className="display-heading mt-2 text-3xl font-semibold sm:text-4xl">{product.name}</h1>

          {product.ratingCount > 0 ? (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex" aria-label={`Rated ${rating} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn('h-4 w-4', n <= Math.round(rating) ? 'fill-primary text-primary' : 'text-muted-foreground/30')}
                  />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                {rating.toFixed(1)} · {product.ratingCount} review{product.ratingCount === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}

          <div className="mt-5 flex items-baseline gap-3">
            <span className="text-3xl font-semibold tabular-nums">{formatMoney(price)}</span>
            {compareAt && compareAt > price ? (
              <span className="text-lg text-muted-foreground line-through tabular-nums">
                {formatMoney(compareAt)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Inclusive of all taxes</p>

          {product.shortDescription ? (
            <p className="mt-5 leading-relaxed text-muted-foreground">{product.shortDescription}</p>
          ) : null}

          {/* Options */}
          <div className="mt-8 space-y-6">
            {product.options?.map((option) => (
              <div key={option.name}>
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="text-sm font-medium">{option.name}</h2>
                  {selected[option.name] ? (
                    <span className="text-sm capitalize text-muted-foreground">
                      {option.values.find((v) => v.slug === selected[option.name])?.value}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {option.values.map((value) => {
                    const isSelected = selected[option.name] === value.slug;
                    const reachable = availableFor[option.name]?.has(value.slug) ?? true;

                    if (value.hexColor) {
                      return (
                        <button
                          key={value.slug}
                          type="button"
                          title={value.value}
                          aria-label={value.value}
                          aria-pressed={isSelected}
                          disabled={!reachable}
                          onClick={() => setSelected((s) => ({ ...s, [option.name]: value.slug }))}
                          className={cn(
                            'relative h-10 w-10 rounded-full border-2 transition-all',
                            isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50',
                            !reachable && 'cursor-not-allowed opacity-30',
                          )}
                          style={{ backgroundColor: value.hexColor }}
                        >
                          {isSelected ? (
                            <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                          ) : null}
                        </button>
                      );
                    }

                    return (
                      <button
                        key={value.slug}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={!reachable}
                        onClick={() => setSelected((s) => ({ ...s, [option.name]: value.slug }))}
                        className={cn(
                          'min-w-12 rounded-md border px-3.5 py-2 text-sm transition-colors',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:border-primary',
                          !reachable && 'cursor-not-allowed text-muted-foreground/40 line-through hover:border-border',
                        )}
                      >
                        {value.value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Stock signal */}
          <div className="mt-6" aria-live="polite">
            {!activeVariant ? (
              <p className="text-sm text-muted-foreground">Select the options above to continue</p>
            ) : available === 0 ? (
              <p className="text-sm font-medium text-destructive">This combination is sold out</p>
            ) : available <= 5 ? (
              <p className="text-sm font-medium text-warning">Only {available} left</p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-success">
                <Check className="h-4 w-4" /> In stock
              </p>
            )}
          </div>

          {/* Add to bag */}
          <div className="mt-6 flex gap-3">
            <div className="flex items-center rounded-md border border-border">
              <button
                type="button"
                className="p-3 text-muted-foreground hover:text-foreground disabled:opacity-40"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-10 text-center tabular-nums">{quantity}</span>
              <button
                type="button"
                className="p-3 text-muted-foreground hover:text-foreground disabled:opacity-40"
                onClick={() => setQuantity((q) => Math.min(available || 1, q + 1))}
                disabled={quantity >= available}
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <Button
              size="lg"
              className="flex-1"
              onClick={handleAdd}
              disabled={!activeVariant || available === 0}
              loading={addToCart.isPending}
            >
              <ShoppingBag className="h-4 w-4" />
              {available === 0 ? 'Sold out' : 'Add to bag'}
            </Button>

            <Button
              size="icon"
              variant="outline"
              className="h-12 w-12"
              aria-label={isSaved ? 'Remove from wishlist' : 'Save to wishlist'}
              onClick={() => {
                if (!user) {
                  window.location.href = '/login?next=' + encodeURIComponent(`/products/${product.slug}`);
                  return;
                }
                toggleWishlist.mutate({ productId: product.id, isSaved });
              }}
            >
              <Heart className={cn('h-5 w-5', isSaved && 'fill-destructive text-destructive')} />
            </Button>
          </div>

          {activeVariant ? (
            <p className="mt-3 text-xs text-muted-foreground">SKU: {activeVariant.sku}</p>
          ) : null}

          <Separator className="my-8" />

          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <Truck className="h-4 w-4 text-primary" aria-hidden />
              Free shipping over ₹1,999 · dispatched within 24 hours
            </li>
            <li className="flex items-center gap-3">
              <RefreshCw className="h-4 w-4 text-primary" aria-hidden />
              30-day returns on unworn pieces
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              Payments verified server-side
            </li>
          </ul>
        </div>
      </div>

      {/* Details */}
      <div className="mt-16 max-w-3xl">
        <Tabs defaultValue="description">
          <TabsList>
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="reviews">Reviews ({product.ratingCount})</TabsTrigger>
            <TabsTrigger value="shipping">Shipping &amp; returns</TabsTrigger>
          </TabsList>

          <TabsContent value="description" className="prose-sm">
            <p className="leading-relaxed text-muted-foreground">{product.description}</p>
            {product.tags?.length ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="capitalize">
                    {tag.replace(/-/g, ' ')}
                  </Badge>
                ))}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="reviews">
            {product.reviews?.length ? (
              <ul className="space-y-6">
                {product.reviews.map((review) => (
                  <li key={review.id} className="border-b border-border pb-6 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={cn('h-3.5 w-3.5', n <= review.rating ? 'fill-primary text-primary' : 'text-muted-foreground/30')}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium">
                        {review.user ? `${review.user.firstName} ${review.user.lastName?.[0] ?? ''}.` : review.author}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                    </div>
                    {review.title ? <p className="mt-2 font-medium">{review.title}</p> : null}
                    {review.comment ? (
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{review.comment}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No reviews yet. Reviews can be written by customers who have received this piece.
              </p>
            )}
          </TabsContent>

          <TabsContent value="shipping">
            <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                Orders are dispatched within 24 hours on working days. Standard delivery takes
                3–6 working days; express delivery 1–2 working days where available.
              </p>
              <p>
                Returns are accepted for 30 days from delivery on unworn pieces with tags attached.
                Refunds are issued to the original payment method within 5–7 working days of the
                returned item reaching us.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
