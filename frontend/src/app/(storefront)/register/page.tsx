'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRegister } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

/** Mirrors the server-side policy so the UI never lets through what the API rejects. */
const RULES = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { label: 'One number', test: (v: string) => /\d/.test(v) },
];

export default function RegisterPage() {
  const register = useRegister();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '' });

  const passed = RULES.filter((r) => r.test(form.password)).length;
  const valid = passed === RULES.length;

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Create your account</CardTitle>
          <CardDescription>Save addresses, track orders and build a wishlist</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              register.mutate({
                email: form.email,
                password: form.password,
                firstName: form.firstName,
                lastName: form.lastName || undefined,
                phone: form.phone || undefined,
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" required autoComplete="given-name" value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" autoComplete="family-name" value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="mt-1.5" />
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" />
            </div>

            <div>
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" type="tel" autoComplete="tel" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5"
                placeholder="+91 98765 43210" />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required autoComplete="new-password" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1.5" />

              {form.password ? (
                <ul className="mt-2 space-y-1" aria-live="polite">
                  {RULES.map((rule) => {
                    const ok = rule.test(form.password);
                    return (
                      <li key={rule.label} className={cn('flex items-center gap-1.5 text-xs', ok ? 'text-success' : 'text-muted-foreground')}>
                        {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            <Button type="submit" className="w-full" size="lg" loading={register.isPending} disabled={!valid}>
              Create account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-foreground hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
