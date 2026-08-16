'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, ApiError, getSessionId, tokenStore } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import type { AuthUser } from '@/types';

interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
  user: AuthUser;
}

export function useLogin() {
  const { setSession } = useAuthStore();
  const qc = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<AuthResponse>('/auth/login', input, { auth: false }),
    onSuccess: async (data) => {
      setSession(data.user, data.accessToken);
      // Fold anything the shopper added while browsing as a guest into their
      // account, so signing in never appears to empty the bag.
      try {
        await api.post('/cart/merge', { sessionId: getSessionId() });
      } catch {
        /* a failed merge must not block sign-in */
      }
      await qc.invalidateQueries();
      toast.success(`Welcome back, ${data.user.firstName}`);
      router.push(data.user.role === 'CUSTOMER' ? '/account' : '/admin');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useRegister() {
  const { setSession } = useAuthStore();
  const qc = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (input: { email: string; password: string; firstName: string; lastName?: string; phone?: string }) =>
      api.post<AuthResponse>('/auth/register', input, { auth: false }),
    onSuccess: async (data) => {
      setSession(data.user, data.accessToken);
      try {
        await api.post('/cart/merge', { sessionId: getSessionId() });
      } catch {
        /* non-fatal */
      }
      await qc.invalidateQueries();
      toast.success('Account created');
      router.push('/account');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useLogout() {
  const { clear } = useAuthStore();
  const qc = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => api.post('/auth/logout', {}, { auth: false }),
    onSettled: async () => {
      // Clear locally even if the server call failed - the user asked to leave.
      clear();
      tokenStore.clear();
      qc.clear();
      router.push('/');
      toast.success('Signed out');
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => api.post('/auth/forgot-password', { email }, { auth: false }),
    onSuccess: () =>
      toast.success('If that address has an account, a reset link is on its way'),
    onError: (error: ApiError) => toast.error(error.message),
  });
}

export function useResetPassword() {
  const router = useRouter();
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      api.post('/auth/reset-password', input, { auth: false }),
    onSuccess: () => {
      toast.success('Password updated - please sign in');
      router.push('/login');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });
}
