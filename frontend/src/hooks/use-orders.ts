'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, type Paginated } from '@/lib/api';
import type { Address, Order } from '@/types';

export function useOrders(page = 1) {
  return useQuery({
    queryKey: ['orders', page],
    queryFn: () => api.get<Paginated<Order>>(`/orders?page=${page}&limit=10`),
  });
}

export function useOrder(id: string, email?: string) {
  return useQuery({
    queryKey: ['order', id, email],
    queryFn: () => api.get<Order>(`/orders/${id}${email ? `?email=${encodeURIComponent(email)}` : ''}`),
    enabled: Boolean(id),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      shippingAddress: Address;
      billingAddress?: Address;
      guestEmail?: string;
      saveAddress?: boolean;
      customerNote?: string;
      paymentMethod?: 'PREPAID' | 'COD';
    }) => api.post<Order>('/orders', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.patch<Order>(`/orders/${id}/cancel`, { reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['order'] });
      toast.success('Order cancelled');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export interface PaymentIntent {
  paymentId: string;
  providerOrderId: string;
  amount: string;
  currency: string;
  publicKey: string;
  orderNumber: string;
}

export function useCreatePaymentIntent() {
  return useMutation({
    // `email` is required for guest checkout: the order has no userId, so the
    // API authorises the request by matching the email captured at checkout.
    // Omitting it made every guest payment intent fail with 403 and the pay
    // button never appeared.
    mutationFn: ({ orderId, email }: { orderId: string; email?: string }) =>
      api.post<PaymentIntent>(
        `/payments/intent${email ? `?email=${encodeURIComponent(email)}` : ''}`,
        { orderId },
      ),
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      orderId: string;
      providerOrderId: string;
      providerPaymentId: string;
      signature: string;
      email?: string;
    }) => {
      const { email, ...body } = input;
      return api.post<{ success: boolean; orderId: string; orderNumber: string }>(
        `/payments/verify${email ? `?email=${encodeURIComponent(email)}` : ''}`,
        body,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['order'] });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}
