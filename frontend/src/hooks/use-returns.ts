'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, type Paginated } from '@/lib/api';
import type { ReturnEligibility, ReturnRequest } from '@/types';

/** What can still be sent back on an order, and until when. */
export function useReturnEligibility(orderId: string | null, email?: string) {
  return useQuery({
    queryKey: ['returns', 'eligibility', orderId, email ?? null],
    queryFn: () =>
      api.get<ReturnEligibility>(
        `/returns/eligibility/${orderId}${email ? `?email=${encodeURIComponent(email)}` : ''}`,
        { auth: !email },
      ),
    enabled: Boolean(orderId),
    // The window closes on a clock, so a stale answer can offer a return that
    // the API will then refuse.
    staleTime: 30_000,
  });
}

export function useMyReturns(enabled = true) {
  return useQuery({
    queryKey: ['returns', 'mine'],
    queryFn: () => api.get<Paginated<ReturnRequest>>('/returns?limit=50'),
    enabled,
  });
}

export function useReturn(id: string | null, email?: string) {
  return useQuery({
    queryKey: ['returns', id, email ?? null],
    queryFn: () =>
      api.get<ReturnRequest>(
        `/returns/${id}${email ? `?email=${encodeURIComponent(email)}` : ''}`,
        { auth: !email },
      ),
    enabled: Boolean(id),
  });
}

export interface CreateReturnInput {
  orderId: string;
  reason: string;
  resolution?: 'REFUND' | 'EXCHANGE';
  customerNote?: string;
  guestEmail?: string;
  items: Array<{ orderItemId: string; quantity: number; reason?: string }>;
}

export function useCreateReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReturnInput) =>
      api.post<ReturnRequest>('/returns', input, { auth: !input.guestEmail }),
    onSuccess: (created) => {
      toast.success(`Return ${created.rmaNumber} opened`);
      void qc.invalidateQueries({ queryKey: ['returns'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useCancelReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<ReturnRequest>(`/returns/${id}/cancel`, {}),
    onSuccess: () => {
      toast.success('Return withdrawn');
      void qc.invalidateQueries({ queryKey: ['returns'] });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}
