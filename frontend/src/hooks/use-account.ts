'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { Address, Product } from '@/types';

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<any>('/account/profile'),
    enabled,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { firstName?: string; lastName?: string; phone?: string }) =>
      api.patch('/account/profile', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile updated');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useAddresses(enabled = true) {
  return useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.get<Address[]>('/account/addresses'),
    enabled,
  });
}

export function useSaveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Address & { id?: string }) =>
      id ? api.patch<Address>(`/account/addresses/${id}`, body) : api.post<Address>('/account/addresses', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['addresses'] });
      toast.success('Address saved');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/account/addresses/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['addresses'] });
      toast.success('Address removed');
    },
  });
}

interface WishlistResponse {
  id: string;
  itemCount: number;
  items: Array<{ id: string; productId: string; product: Product & { primaryImage: string | null; inStock: boolean } }>;
}

export function useWishlist(enabled = true) {
  return useQuery({
    queryKey: ['wishlist'],
    queryFn: () => api.get<WishlistResponse>('/wishlist'),
    enabled,
  });
}

export function useToggleWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, isSaved }: { productId: string; isSaved: boolean }) =>
      isSaved
        ? api.delete(`/wishlist/products/${productId}`)
        : api.post('/wishlist/items', { productId }),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['wishlist'] });
      toast.success(variables.isSaved ? 'Removed from wishlist' : 'Saved to wishlist');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}
