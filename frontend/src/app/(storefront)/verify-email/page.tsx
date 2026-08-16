'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import { toast } from 'sonner';

type State = 'verifying' | 'verified' | 'failed' | 'missing';

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [state, setState] = useState<State>(token ? 'verifying' : 'missing');
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  // React 18 StrictMode mounts effects twice in development; a verification
  // token is single-use, so the second call would always report failure.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    api
      .post('/auth/verify-email', { token }, { auth: false })
      .then(() => {
        setState('verified');
        if (user) setUser({ ...user, emailVerified: true });
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Verification failed');
        setState('failed');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const resend = async () => {
    setResending(true);
    try {
      await api.post('/auth/resend-verification', {});
      toast.success('A fresh verification link is on its way');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not resend');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            {state === 'verifying' ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : null}
            {state === 'verified' ? <CheckCircle2 className="h-7 w-7 text-success" /> : null}
            {state === 'failed' || state === 'missing' ? <XCircle className="h-7 w-7 text-destructive" /> : null}
          </div>
          <CardTitle className="mt-4 font-serif text-2xl">
            {state === 'verifying' ? 'Confirming your email' : null}
            {state === 'verified' ? 'Email confirmed' : null}
            {state === 'failed' ? 'This link did not work' : null}
            {state === 'missing' ? 'Link is incomplete' : null}
          </CardTitle>
          <CardDescription>
            {state === 'verifying' ? 'One moment…' : null}
            {state === 'verified' ? 'Your account is fully set up.' : null}
            {state === 'failed' ? (error ?? 'The link may have expired or already been used.') : null}
            {state === 'missing' ? 'This page needs a verification token from your email.' : null}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {state === 'verified' ? (
            <>
              <Button asChild className="w-full"><Link href="/account">Go to my account</Link></Button>
              <Button asChild variant="outline" className="w-full"><Link href="/products">Continue shopping</Link></Button>
            </>
          ) : null}

          {state === 'failed' || state === 'missing' ? (
            <>
              {user ? (
                <Button className="w-full" onClick={resend} loading={resending}>
                  <MailCheck className="h-4 w-4" /> Send me a new link
                </Button>
              ) : (
                <Button asChild className="w-full">
                  <Link href="/login">Sign in to resend</Link>
                </Button>
              )}
              <Button asChild variant="outline" className="w-full"><Link href="/">Back to the store</Link></Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="container py-32 text-center text-muted-foreground">Loading…</div>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
