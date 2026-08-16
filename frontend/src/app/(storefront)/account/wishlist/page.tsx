'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductCard } from '@/components/product/product-card';
import { useWishlist } from '@/hooks/use-account';

export default function WishlistPage() {
  const { data: wishlist, isLoading } = useWishlist();

  if (isLoading) {
    return (
      <div className="product-grid">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/5]" />)}
      </div>
    );
  }

  if (!wishlist?.items.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <Heart className="h-12 w-12 text-muted-foreground/30" />
          <h2 className="mt-4 font-medium">Your wishlist is empty</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap the heart on any product to save it here.
          </p>
          <Button asChild className="mt-6"><Link href="/products">Browse products</Link></Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-lg font-medium">
        {wishlist.itemCount} saved item{wishlist.itemCount === 1 ? '' : 's'}
      </h2>
      <div className="product-grid">
        {wishlist.items.map((item) => (
          <ProductCard key={item.id} product={item.product as never} />
        ))}
      </div>
    </div>
  );
}
