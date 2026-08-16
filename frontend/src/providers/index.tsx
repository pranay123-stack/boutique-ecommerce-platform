'use client';

import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { QueryProvider } from './query-provider';
import { AuthBootstrap } from './auth-bootstrap';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthBootstrap />
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: 'bg-card text-card-foreground border border-border shadow-lg',
          },
        }}
      />
    </QueryProvider>
  );
}
