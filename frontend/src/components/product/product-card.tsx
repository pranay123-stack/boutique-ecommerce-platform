'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Product } from '@/types';

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const image = product.primaryImage ?? product.images?.[0]?.url ?? null;
  const price = product.effectivePrice ?? Number(product.basePrice);
  const compareAt = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const showCompare = compareAt !== null && compareAt > price;
  const rating = Number(product.ratingAverage);

  return (
    <article className="group relative animate-fade-up">
      <Link href={`/products/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
          {image ? (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw"
              priority={priority}
              // Below-the-fold cards stay lazy; the first row is marked priority.
              loading={priority ? undefined : 'lazy'}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No image
            </div>
          )}

          <div className="absolute left-3 top-3 flex flex-col gap-1.5">
            {product.discountPercent && product.discountPercent > 0 ? (
              <Badge variant="destructive">−{product.discountPercent}%</Badge>
            ) : null}
            {product.isNewArrival ? <Badge variant="secondary">New</Badge> : null}
          </div>

          {product.inStock === false ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <span className="rounded-full bg-background px-4 py-1.5 text-xs font-medium uppercase tracking-wide">
                Sold out
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-3 space-y-1">
          {product.brand ? (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{product.brand}</p>
          ) : null}
          <h3 className="text-sm font-medium leading-snug text-foreground">{product.name}</h3>

          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tabular-nums">{formatMoney(price)}</span>
            {showCompare ? (
              <span className="text-xs text-muted-foreground line-through tabular-nums">
                {formatMoney(compareAt)}
              </span>
            ) : null}
          </div>

          {product.ratingCount > 0 ? (
            <div className="flex items-center gap-1" aria-label={`Rated ${rating} out of 5`}>
              <div className="flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn(
                      'h-3 w-3',
                      n <= Math.round(rating) ? 'fill-primary text-primary' : 'text-muted-foreground/30',
                    )}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">({product.ratingCount})</span>
            </div>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="aspect-[4/5] animate-pulse rounded-lg bg-muted" />
      <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
    </div>
  );
}
