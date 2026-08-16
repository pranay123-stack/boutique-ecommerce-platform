'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, type Paginated } from '@/lib/api';
import type { Review } from '@/types';

export function useMyReviews(enabled = true) {
  return useQuery({
    queryKey: ['reviews', 'mine'],
    queryFn: () => api.get<Paginated<Review>>('/reviews/mine?limit=50'),
    enabled,
  });
}

export function useProductReviews(productId: string, enabled = true) {
  return useQuery({
    queryKey: ['reviews', 'product', productId],
    queryFn: () =>
      api.get<Paginated<Review> & { distribution: Record<string, number> }>(
        `/reviews/product/${productId}?limit=20`,
      ),
    enabled: enabled && Boolean(productId),
  });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { productId: string; rating: number; title?: string; comment?: string }) =>
      api.post<Review>('/reviews', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      // Reviews are held for moderation, so say so rather than implying it is live.
      toast.success('Thank you — your review has been submitted for moderation');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}
