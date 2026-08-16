'use client';

import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, type Paginated } from '@/lib/api';
import type { ContactMessage, Order, Product, Review, ReturnRequest } from '@/types';

// ------------------------------------------------------------------ analytics

export interface DashboardStats {
  range: { from: string; to: string };
  revenue: {
    gross: string; refunded: string; net: string; shipping: string;
    tax: string; discounts: string; averageOrderValue: string;
  };
  orders: { paid: number; total: number; pendingFulfilment: number; conversionRate: number };
  customers: { total: number; new: number };
  refunds: { count: number; amount: string };
  alerts: { lowStockVariants: number };
}

export function useDashboard(from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return useQuery({
    queryKey: ['admin', 'dashboard', from, to],
    queryFn: () => api.get<DashboardStats>(`/admin/analytics/dashboard?${qs}`),
  });
}

export function useSalesSeries(from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return useQuery({
    queryKey: ['admin', 'sales-series', from, to],
    queryFn: () => api.get<Array<{ date: string; revenue: number; orders: number }>>(`/admin/analytics/sales-series?${qs}`),
  });
}

export function useBestSellers(limit = 8) {
  return useQuery({
    queryKey: ['admin', 'best-sellers', limit],
    queryFn: () =>
      api.get<Array<{ productId: string; productName: string; slug: string | null; unitsSold: number; revenue: string }>>(
        `/admin/analytics/best-sellers?limit=${limit}`,
      ),
  });
}

export function useRevenueByCategory() {
  return useQuery({
    queryKey: ['admin', 'revenue-by-category'],
    queryFn: () =>
      api.get<Array<{ categoryId: string; categoryName: string; revenue: string; units: number }>>(
        '/admin/analytics/revenue-by-category',
      ),
  });
}

// --------------------------------------------------------------------- orders

export function useAdminOrders(params: { page?: number; status?: string; search?: string }) {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', '20');
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  return useQuery({
    queryKey: ['admin', 'orders', params],
    queryFn: () => api.get<Paginated<Order>>(`/admin/orders?${qs}`),
    placeholderData: keepPreviousData,
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: () => api.get<Order>(`/admin/orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      api.patch<Order>(`/admin/orders/${id}/status`, { status, note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.success('Order updated');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useCreateShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api.post(`/admin/shipping/orders/${orderId}/shipments`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.success('Shipment booked');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useRefundOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, amount, reason }: { orderId: string; amount: number; reason?: string }) =>
      api.post(`/admin/payments/orders/${orderId}/refund`, { amount, reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.success('Refund issued');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

// ------------------------------------------------------------------- products

export function useAdminProducts(params: { page?: number; search?: string; status?: string }) {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', '20');
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  return useQuery({
    queryKey: ['admin', 'products', params],
    queryFn: () => api.get<Paginated<Product & { totalStock: number; lowStock: boolean }>>(`/admin/products?${qs}`),
    placeholderData: keepPreviousData,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<Product>('/admin/products', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      toast.success('Product created');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch<Product>(`/admin/products/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      toast.success('Product updated');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/products/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      toast.success('Product archived');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

// ------------------------------------------------------------------ inventory

export function useLowStock(page = 1) {
  return useQuery({
    queryKey: ['admin', 'low-stock', page],
    queryFn: () =>
      api.get<Paginated<any>>(`/admin/inventory/low-stock?page=${page}&limit=20`),
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, quantity, reason }: { variantId: string; quantity: number; reason?: string }) =>
      api.patch(`/admin/inventory/${variantId}`, { quantity, changeType: 'ADJUSTMENT', reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.success('Stock updated');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

// ------------------------------------------------------------------ customers

export function useAdminCustomers(params: { page?: number; search?: string }) {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', '20');
  if (params.search) qs.set('search', params.search);
  return useQuery({
    queryKey: ['admin', 'customers', params],
    queryFn: () => api.get<Paginated<any>>(`/admin/customers?${qs}`),
    placeholderData: keepPreviousData,
  });
}

// -------------------------------------------------------------------- coupons

export function useAdminCoupons(page = 1) {
  return useQuery({
    queryKey: ['admin', 'coupons', page],
    queryFn: () => api.get<Paginated<any>>(`/admin/coupons?page=${page}&limit=20`),
  });
}

export function useSaveCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown> & { id?: string }) =>
      id ? api.patch(`/admin/coupons/${id}`, body) : api.post('/admin/coupons', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      toast.success('Coupon saved');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useDeleteCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/admin/coupons/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      toast.success('Coupon removed');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

// -------------------------------------------------------------------- reviews

export function useAdminReviews(status?: string) {
  return useQuery({
    queryKey: ['admin', 'reviews', status],
    queryFn: () => api.get<Paginated<Review>>(`/admin/reviews?limit=50${status ? `&status=${status}` : ''}`),
  });
}

export function useModerateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/admin/reviews/${id}/status`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      toast.success('Review moderated');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

// ------------------------------------------------------------------ returns

export function useAdminReturns(params: { page?: number; status?: string; search?: string }) {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', '20');
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  return useQuery({
    queryKey: ['admin', 'returns', params],
    queryFn: () => api.get<Paginated<ReturnRequest>>(`/admin/returns?${qs}`),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateReturnStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, staffNote }: { id: string; status: string; staffNote?: string }) =>
      api.patch<ReturnRequest>(`/admin/returns/${id}/status`, { status, staffNote }),
    onSuccess: () => {
      toast.success('Return updated');
      void qc.invalidateQueries({ queryKey: ['admin', 'returns'] });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useInspectReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      items,
      staffNote,
    }: {
      id: string;
      items: Array<{ returnItemId: string; restockable: boolean; note?: string }>;
      staffNote?: string;
    }) => api.post<ReturnRequest>(`/admin/returns/${id}/inspect`, { items, staffNote }),
    onSuccess: () => {
      toast.success('Inspection recorded');
      void qc.invalidateQueries({ queryKey: ['admin', 'returns'] });
      // Saleable items go straight back on sale, so stock views are now stale.
      void qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

// ------------------------------------------------------------------ support

export function useAdminContactMessages(params: { page?: number; status?: string; search?: string }) {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', '20');
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  return useQuery({
    queryKey: ['admin', 'contact', params],
    queryFn: () => api.get<Paginated<ContactMessage>>(`/admin/support/contact?${qs}`),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateContactMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, staffNote }: { id: string; status: string; staffNote?: string }) =>
      api.patch<ContactMessage>(`/admin/support/contact/${id}`, { status, staffNote }),
    onSuccess: () => {
      toast.success('Message updated');
      void qc.invalidateQueries({ queryKey: ['admin', 'contact'] });
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}
