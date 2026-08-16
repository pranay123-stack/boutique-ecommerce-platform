'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { SlidersHorizontal, ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductCard, ProductCardSkeleton } from '@/components/product/product-card';
import { ProductFilters, ActiveFilterChips } from '@/components/product/product-filters';
import { useFacets, useProducts, type ProductQuery } from '@/hooks/use-products';

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'relevance', label: 'Most relevant' },
  { value: 'best_selling', label: 'Best selling' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'name_asc', label: 'A – Z' },
];

/**
 * Filter state lives in the URL, not in component state.
 *
 * That makes every filtered view shareable, bookmarkable and restorable with
 * the back button - the behaviour shoppers expect but which a purely local
 * useState implementation silently breaks.
 */
export function ProductBrowser({ fixedCategory, title }: { fixedCategory?: string; title?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useMemo<ProductQuery>(() => {
    const csv = (key: string) => {
      const raw = searchParams.get(key);
      return raw ? raw.split(',').filter(Boolean) : undefined;
    };
    const num = (key: string) => {
      const raw = searchParams.get(key);
      return raw !== null && raw !== '' ? Number(raw) : undefined;
    };
    return {
      q: searchParams.get('q') ?? undefined,
      category: fixedCategory ?? searchParams.get('category') ?? undefined,
      brands: csv('brands'),
      attributes: csv('attributes'),
      minPrice: num('minPrice'),
      maxPrice: num('maxPrice'),
      inStock: searchParams.get('inStock') === 'true',
      sort: searchParams.get('sort') ?? (searchParams.get('q') ? 'relevance' : 'newest'),
      page: num('page') ?? 1,
      limit: 12,
    };
  }, [searchParams, fixedCategory]);

  const { data, isLoading, isPlaceholderData } = useProducts(query);
  const { data: facets } = useFacets(query);

  const pushQuery = useCallback(
    (patch: Partial<ProductQuery>) => {
      const next = { ...query, ...patch };
      const params = new URLSearchParams();
      if (next.q) params.set('q', next.q);
      if (!fixedCategory && next.category) params.set('category', next.category);
      if (next.brands?.length) params.set('brands', next.brands.join(','));
      if (next.attributes?.length) params.set('attributes', next.attributes.join(','));
      if (next.minPrice !== undefined) params.set('minPrice', String(next.minPrice));
      if (next.maxPrice !== undefined) params.set('maxPrice', String(next.maxPrice));
      if (next.inStock) params.set('inStock', 'true');
      if (next.sort) params.set('sort', next.sort);
      if (next.page && next.page > 1) params.set('page', String(next.page));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [query, router, pathname, fixedCategory],
  );

  const reset = useCallback(() => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [query.q, router, pathname]);

  const products = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="display-heading text-4xl font-semibold">
          {title ?? (query.q ? `Results for “${query.q}”` : 'All products')}
        </h1>
        {meta ? (
          <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
            {meta.total} {meta.total === 1 ? 'piece' : 'pieces'}
          </p>
        ) : null}
      </div>

      <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
        {/* Desktop filters */}
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <ProductFilters facets={facets} query={query} onChange={pushQuery} onReset={reset} />
          </div>
        </aside>

        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Mobile filters */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
                    <SlidersHorizontal className="h-4 w-4" /> Filters
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  <div className="p-6">
                    <ProductFilters facets={facets} query={query} onChange={pushQuery} onReset={reset} />
                  </div>
                </SheetContent>
              </Sheet>
              <ActiveFilterChips query={query} onChange={pushQuery} />
            </div>

            <Select value={query.sort} onValueChange={(sort) => pushQuery({ sort, page: 1 })}>
              <SelectTrigger className="w-52" aria-label="Sort products">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="product-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-24 text-center">
              <SearchX className="h-10 w-10 text-muted-foreground/40" />
              <h2 className="mt-4 text-lg font-medium">Nothing matched</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Try removing a filter, or search for something broader.
              </p>
              <Button variant="outline" className="mt-6" onClick={reset}>
                Clear filters
              </Button>
            </div>
          ) : (
            <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <div className="product-grid">
                {products.map((product, i) => (
                  <ProductCard key={product.id} product={product} priority={i < 4} />
                ))}
              </div>
            </div>
          )}

          {meta && meta.totalPages > 1 ? (
            <nav className="mt-12 flex items-center justify-center gap-2" aria-label="Pagination">
              <Button
                variant="outline"
                size="sm"
                disabled={!meta.hasPrevious}
                onClick={() => pushQuery({ page: (query.page ?? 1) - 1 })}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!meta.hasNext}
                onClick={() => pushQuery({ page: (query.page ?? 1) + 1 })}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}
