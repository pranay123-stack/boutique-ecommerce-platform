import type { Metadata } from 'next';
import { Mail, Phone, MapPin, Clock } from 'lucide-react';
import { ContactForm } from '@/components/legal/contact-form';
import { legal } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch about an order, a product, or anything else.',
};

function Detail({ value, placeholder }: { value: string; placeholder: string }) {
  if (value) return <>{value}</>;
  return (
    <span className="rounded bg-amber-100 px-1 font-mono text-[13px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      [{placeholder}]
    </span>
  );
}

export default function ContactPage() {
  return (
    <div className="container max-w-5xl py-16">
      <h1 className="display-heading text-4xl font-semibold">Get in touch</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Questions about an order, a size, or a piece you have your eye on? Write to us and a real
        person will reply — usually within one business day.
      </p>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_320px]">
        <ContactForm />

        <aside className="space-y-8 text-sm">
          <div>
            <h2 className="display-heading text-lg font-semibold">Reach us directly</h2>
            <ul className="mt-4 space-y-4 text-muted-foreground">
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <div className="font-medium text-foreground">Email</div>
                  <Detail value={legal.supportEmail} placeholder="support email" />
                </div>
              </li>
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <div className="font-medium text-foreground">Phone</div>
                  <Detail value={legal.supportPhone} placeholder="support phone" />
                </div>
              </li>
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <div className="font-medium text-foreground">Hours</div>
                  Monday to Saturday, 10am–7pm IST
                </div>
              </li>
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <div className="font-medium text-foreground">Registered office</div>
                  <Detail value={legal.address} placeholder="registered address" />
                </div>
              </li>
            </ul>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 text-muted-foreground">
            <h3 className="font-medium text-foreground">Before you write</h3>
            <p className="mt-2">
              Tracking an order or starting a return is faster from your account — no waiting for a
              reply. Have your order number ready if you write to us; it lets us answer in one
              message instead of three.
            </p>
          </div>

          <div className="text-xs text-muted-foreground">
            We use what you send us only to answer your question. See our{' '}
            <a href="/privacy" className="underline underline-offset-4">
              privacy policy
            </a>
            .
          </div>
        </aside>
      </div>
    </div>
  );
}
