import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ProductBrowser } from './product-browser';
import { ProductCardSkeleton } from '@/components/product/product-card';

export const metadata: Metadata = {
  title: 'All products',
  description: 'Browse the full boutique collection - filter by category, colour, size, material and price.',
};

function BrowserFallback() {
  return (
    <div className="container py-10">
      <div className="h-10 w-64 animate-pulse rounded bg-muted" />
      <div className="product-grid mt-10">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<BrowserFallback />}>
      <ProductBrowser />
    </Suspense>
  );
}
