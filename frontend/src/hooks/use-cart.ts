'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { Cart } from '@/types';

export const cartKeys = { all: ['cart'] as const };

export function useCart() {
  return useQuery({
    queryKey: cartKeys.all,
    queryFn: () => api.get<Cart>('/cart'),
    staleTime: 0, // the cart is the one thing that must never look stale
  });
}

export function useAddToCart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { variantId: string; quantity: number }) =>
      api.post<Cart>('/cart/items', input),
    onSuccess: (cart) => {
      qc.setQueryData(cartKeys.all, cart);
      toast.success('Added to bag');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUpdateCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      api.patch<Cart>(`/cart/items/${itemId}`, { quantity }),
    onSuccess: (cart) => qc.setQueryData(cartKeys.all, cart),
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useRemoveCartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.delete<Cart>(`/cart/items/${itemId}`),
    onSuccess: (cart) => {
      qc.setQueryData(cartKeys.all, cart);
      toast.success('Removed from bag');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useApplyCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<Cart>('/cart/coupon', { code }),
    onSuccess: (cart) => {
      qc.setQueryData(cartKeys.all, cart);
      toast.success('Discount applied');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useRemoveCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<Cart>('/cart/coupon'),
    onSuccess: (cart) => qc.setQueryData(cartKeys.all, cart),
  });
}
