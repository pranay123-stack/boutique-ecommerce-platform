'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ImageCredit {
  source: 'unsplash' | 'pexels';
  photographer: string;
  photographerUrl: string;
  sourceUrl: string;
}

const SOURCE_LABEL: Record<ImageCredit['source'], string> = {
  unsplash: 'Unsplash',
  pexels: 'Pexels',
};

/**
 * Credits for demo imagery, keyed by image path.
 *
 * Fetched once and held for the session — the map only changes when the seed
 * runs, and it is empty in the normal case where the merchant has supplied
 * their own photographs.
 */
export function useImageCredits() {
  return useQuery({
    queryKey: ['image-credits'],
    queryFn: () => api.get<Record<string, ImageCredit>>('/content/image-credits', { auth: false }),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

/**
 * Photographer attribution shown beneath a stock photograph.
 *
 * Both Unsplash and Pexels require the photographer to be credited wherever
 * their work appears. Renders nothing for images that need no credit, which is
 * what every image looks like once real product photography replaces the
 * placeholders.
 */
export function PhotoCredit({ url, className }: { url?: string | null; className?: string }) {
  const { data } = useImageCredits();
  const credit = url ? data?.[url] : undefined;
  if (!credit) return null;

  return (
    <p className={className ?? 'text-xs text-muted-foreground'}>
      Photo by{' '}
      <a
        href={credit.photographerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {credit.photographer}
      </a>{' '}
      on{' '}
      <a
        href={credit.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {SOURCE_LABEL[credit.source]}
      </a>
    </p>
  );
}
