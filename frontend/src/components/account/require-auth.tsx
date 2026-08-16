'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import type { AuthUser } from '@/types';

/**
 * Client-side route guard.
 *
 * This is a UX affordance, not a security boundary - every protected resource
 * is independently authorised on the server. Its job is to avoid rendering an
 * account shell that would immediately 401.
 */
export function RequireAuth({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: Array<AuthUser['role']>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Give the persisted store a tick to rehydrate before deciding.
    const timer = setTimeout(() => {
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      if (roles && !roles.includes(user.role)) {
        router.replace('/');
        return;
      }
      setChecked(true);
    }, 60);
    return () => clearTimeout(timer);
  }, [user, roles, router, pathname]);

  if (!checked) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}
