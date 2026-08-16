'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import type { Facets, Product, Category } from '@/types';

export interface ProductQuery {
  q?: string;
  category?: string;
  brands?: string[];
  attributes?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
}

export function buildProductQuery(query: ProductQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);
  if (query.brands?.length) params.set('brands', query.brands.join(','));
  if (query.attributes?.length) params.set('attributes', query.attributes.join(','));
  if (query.minPrice !== undefined) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== undefined) params.set('maxPrice', String(query.maxPrice));
  if (query.minRating) params.set('minRating', String(query.minRating));
  if (query.inStock) params.set('inStock', 'true');
  if (query.sort) params.set('sort', query.sort);
  params.set('page', String(query.page ?? 1));
  params.set('limit', String(query.limit ?? 12));
  return params.toString();
}

export function useProducts(query: ProductQuery) {
  return useQuery({
    queryKey: ['products', query],
    queryFn: () => api.get<Paginated<Product>>(`/products?${buildProductQuery(query)}`),
    // Keeps the previous page on screen while the next one loads, so filters
    // do not flash an empty grid.
    placeholderData: keepPreviousData,
  });
}

export function useFacets(query: ProductQuery) {
  return useQuery({
    queryKey: ['facets', query.category, query.q],
    queryFn: () =>
      api.get<Facets>(`/products/facets?${buildProductQuery({ category: query.category, q: query.q })}`),
    staleTime: 5 * 60_000,
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: () => api.get<Product>(`/products/${slug}`),
    enabled: Boolean(slug),
  });
}

export function useRelatedProducts(slug: string) {
  return useQuery({
    queryKey: ['product', slug, 'related'],
    queryFn: () => api.get<Product[]>(`/products/${slug}/related`),
    enabled: Boolean(slug),
  });
}

export function useCategoryTree() {
  return useQuery({
    queryKey: ['categories', 'tree'],
    queryFn: () => api.get<Category[]>('/categories/tree'),
    staleTime: 10 * 60_000,
  });
}
