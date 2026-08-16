'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useForgotPassword } from '@/hooks/use-auth';

export default function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Reset your password</CardTitle>
          <CardDescription>We&apos;ll email you a link to set a new one</CardDescription>
        </CardHeader>
        <CardContent>
          {forgot.isSuccess ? (
            <div className="space-y-4 text-sm">
              <p className="rounded-md bg-success/10 p-4 text-success">
                If an account exists for that address, a reset link is on its way.
              </p>
              <Button asChild variant="outline" className="w-full"><Link href="/login">Back to sign in</Link></Button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); forgot.mutate(email); }}
            >
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
              </div>
              <Button type="submit" className="w-full" size="lg" loading={forgot.isPending}>
                Send reset link
              </Button>
              <Button asChild variant="ghost" className="w-full"><Link href="/login">Back to sign in</Link></Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
