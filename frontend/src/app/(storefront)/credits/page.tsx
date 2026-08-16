import type { Metadata } from 'next';
import Link from 'next/link';
import { Camera } from 'lucide-react';
import { serverFetch } from '@/lib/api';
import type { ImageCredit } from '@/components/product/photo-credit';

export const metadata: Metadata = {
  title: 'Photo Credits',
  description: 'Photographers whose work appears on this site.',
};

/**
 * Rendered per request, with the API response cached for an hour.
 *
 * Not build-time prerendered: `next build` runs inside the Docker image with
 * no reachable API, so a prerendered version bakes in "no stock photography"
 * and serves it until ISR first revalidates - leaving photographers uncredited
 * on a page whose entire job is crediting them.
 *
 * Unlike the homepage this page is a handful of links, so rendering it per
 * request costs nothing. `fetchCache` keeps the API call cached regardless,
 * because `force-dynamic` would otherwise switch every fetch to no-store.
 */
export const dynamic = 'force-dynamic';
export const fetchCache = 'default-cache';
export const revalidate = 3600;

const SOURCE_LABEL: Record<string, string> = { unsplash: 'Unsplash', pexels: 'Pexels' };

/** Group by area so the page reads as "where you saw it", not a list of paths. */
function areaOf(path: string): string {
  if (path.includes('/products/')) return 'Product photography';
  if (path.includes('/categories/')) return 'Category imagery';
  if (path.includes('/banners/')) return 'Homepage banners';
  return 'Other imagery';
}

export default async function CreditsPage() {
  const credits =
    (await serverFetch<Record<string, ImageCredit>>('/content/image-credits', 3600)) ?? {};
  const entries = Object.entries(credits);

  // Same photographer can appear across several images; credit them once per area.
  const grouped = new Map<string, Map<string, ImageCredit>>();
  for (const [path, credit] of entries) {
    const area = areaOf(path);
    if (!grouped.has(area)) grouped.set(area, new Map());
    grouped.get(area)!.set(`${credit.photographer}|${credit.sourceUrl}`, credit);
  }

  return (
    <div className="container max-w-3xl py-16">
      <h1 className="display-heading text-4xl font-semibold">Photo credits</h1>
      <p className="mt-3 text-muted-foreground">
        The photographs on this site are placeholders while the catalogue is being prepared. They
        are the work of the photographers below, published under the{' '}
        <a
          href="https://www.pexels.com/license/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          Pexels
        </a>{' '}
        and{' '}
        <a
          href="https://unsplash.com/license"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          Unsplash
        </a>{' '}
        licences, and credited here as those licences ask.
      </p>

      {entries.length === 0 ? (
        <div className="mt-12 rounded-lg border border-dashed py-16 text-center">
          <Camera className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-4 text-sm text-muted-foreground">
            No stock photography is in use — every image on this site is our own.
          </p>
        </div>
      ) : (
        <div className="mt-12 space-y-10">
          {[...grouped.entries()].map(([area, photographers]) => (
            <section key={area}>
              <h2 className="display-heading text-xl font-semibold">{area}</h2>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {[...photographers.values()]
                  .sort((a, b) => a.photographer.localeCompare(b.photographer))
                  .map((credit) => (
                    <li key={`${credit.photographer}-${credit.sourceUrl}`}>
                      <a
                        href={credit.photographerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        {credit.photographer}
                      </a>{' '}
                      on{' '}
                      <a
                        href={credit.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        {SOURCE_LABEL[credit.source] ?? credit.source}
                      </a>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="mt-14 border-t pt-6 text-sm text-muted-foreground">
        Questions about imagery on this site?{' '}
        <Link href="/contact" className="underline underline-offset-4 hover:text-foreground">
          Get in touch
        </Link>
        .
      </div>
    </div>
  );
}
