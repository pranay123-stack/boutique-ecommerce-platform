'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useResetPassword } from '@/hooks/use-auth';

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Choose a new password</CardTitle>
          <CardDescription>Your existing sessions will be signed out</CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <p className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
              This reset link is missing its token. Please request a new one.
            </p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); if (!mismatch) reset.mutate({ token, password }); }}
            >
              <div>
                <Label htmlFor="password">New password</Label>
                <Input id="password" type="password" required autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" required autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={mismatch} className="mt-1.5" />
                {mismatch ? <p className="mt-1 text-xs text-destructive">Passwords do not match</p> : null}
              </div>
              <Button type="submit" className="w-full" size="lg" loading={reset.isPending} disabled={mismatch}>
                Update password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="container py-32 text-center">Loading…</div>}>
      <ResetForm />
    </Suspense>
  );
}
