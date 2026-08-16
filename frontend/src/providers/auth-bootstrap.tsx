'use client';

import { useEffect } from 'react';
import { api, tokenStore } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import type { AuthUser } from '@/types';

/**
 * Restores the session on first load.
 *
 * The access token is short-lived and kept in sessionStorage, so after a
 * browser restart it is gone while the httpOnly refresh cookie survives. This
 * silently exchanges that cookie for a fresh access token, which is what keeps
 * "remember me" working without ever exposing a long-lived token to JS.
 */
export function AuthBootstrap() {
  const { user, setUser, clear } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      if (tokenStore.get()) {
        try {
          const me = await api.get<AuthUser>('/auth/me');
          if (!cancelled && me) setUser({ ...(user ?? ({} as AuthUser)), ...me });
          return;
        } catch {
          tokenStore.clear();
        }
      }

      if (user) {
        // We believe we are signed in but hold no token - try the refresh cookie.
        try {
          const profile = await api.get<AuthUser>('/auth/me');
          if (!cancelled && profile) setUser({ ...user, ...profile });
        } catch {
          if (!cancelled) clear();
        }
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
