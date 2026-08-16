'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';

const SUBJECTS = [
  'Question about an order',
  'Product or sizing question',
  'Returns and refunds',
  'Something arrived damaged',
  'Wholesale or press',
  'Something else',
];

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/support/contact', {
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        phone: String(form.get('phone') ?? '') || undefined,
        orderNumber: String(form.get('orderNumber') ?? '') || undefined,
        subject: String(form.get('subject') ?? ''),
        message: String(form.get('message') ?? ''),
        // Honeypot: hidden from people, irresistible to bots.
        website: String(form.get('website') ?? ''),
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 429
            ? 'That is a few too many messages in a short time. Please try again in a minute.'
            : err.message
          : 'Something went wrong. Please try again, or email us directly.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div
        role="status"
        className="flex items-start gap-4 rounded-lg border border-emerald-300 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-950/40"
      >
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
        <div>
          <h2 className="font-medium text-emerald-900 dark:text-emerald-200">Message sent</h2>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
            Thank you — we have it. You will hear back within one business day, usually sooner.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => setSent(false)}>
            Send another message
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate={false}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name">Your name</Label>
          <Input id="contact-name" name="name" required maxLength={120} autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-phone">
            Phone <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="contact-phone" name="phone" type="tel" maxLength={20} autoComplete="tel" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-order">
            Order number <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="contact-order" name="orderNumber" maxLength={40} placeholder="BQ-20260817-XXXXXX" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-subject">What is this about?</Label>
        <select
          id="contact-subject"
          name="subject"
          required
          defaultValue={SUBJECTS[0]}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-message">Message</Label>
        <Textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={7}
          placeholder="Tell us what you need. The more detail, the faster we can help."
        />
      </div>

      {/*
        Honeypot. Hidden from sighted users and from screen readers, so only a
        bot filling in every field it finds will complete it.
      */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-website">Leave this empty</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send message'}
      </Button>
    </form>
  );
}
