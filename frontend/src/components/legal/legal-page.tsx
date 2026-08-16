import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { legal, missingLegalDetails } from '@/lib/legal';

/**
 * Shared shell for the policy pages: title, last-updated date, prose styling,
 * and - while the merchant's particulars are still unset - a banner saying so.
 *
 * The banner matters. A polished policy page with invented company details is
 * worse than an obviously unfinished one, because nobody notices it needs
 * filling in until a customer relies on it.
 */
export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const missing = missingLegalDetails();

  return (
    <div className="container max-w-3xl py-16">
      <h1 className="display-heading text-4xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted-foreground">{summary}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated{' '}
        {new Date(legal.lastUpdated).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>

      {missing.length > 0 && (
        <div
          role="status"
          className="mt-8 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <strong className="font-medium">This policy is not ready to publish.</strong> The
            following still need to be set before the store accepts live orders:{' '}
            {missing.join(', ')}. Set them in the frontend environment, and have the finished text
            reviewed by a lawyer — the wording below is a working draft, not legal advice.
          </div>
        </div>
      )}

      <div className="prose-boutique mt-10 space-y-8 text-[15px] leading-relaxed">{children}</div>

      <div className="mt-14 border-t pt-6 text-sm text-muted-foreground">
        Questions about this page?{' '}
        <Link href="/contact" className="underline underline-offset-4 hover:text-foreground">
          Get in touch
        </Link>
        .
      </div>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="display-heading text-xl font-semibold text-foreground">{heading}</h2>
      <div className="mt-3 space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}

/** A merchant particular, or an obvious gap where one belongs. */
export function Detail({ value, placeholder }: { value: string; placeholder: string }) {
  if (value) return <>{value}</>;
  return (
    <span className="rounded bg-amber-100 px-1 font-mono text-[13px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      [{placeholder}]
    </span>
  );
}
