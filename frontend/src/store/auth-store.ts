'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser } from '@/types';
import { tokenStore } from '@/lib/api';

interface AuthState {
  user: AuthUser | null;
  isHydrated: boolean;
  setSession: (user: AuthUser, accessToken: string) => void;
  setUser: (user: AuthUser | null) => void;
  clear: () => void;
  isStaff: () => boolean;
}

/**
 * Auth state.
 *
 * Only the user profile is persisted - never the access token, which lives in
 * sessionStorage via tokenStore, and never the refresh token, which is an
 * httpOnly cookie the browser handles.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isHydrated: false,
      setSession: (user, accessToken) => {
        tokenStore.set(accessToken);
        set({ user });
      },
      setUser: (user) => set({ user }),
      clear: () => {
        tokenStore.clear();
        set({ user: null });
      },
      isStaff: () => {
        const role = get().user?.role;
        return role === 'ADMIN' || role === 'MANAGER' || role === 'SUPPORT';
      },
    }),
    {
      name: 'boutique.auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state) state.isHydrated = true;
      },
    },
  ),
);
