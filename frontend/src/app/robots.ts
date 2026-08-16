import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100').replace(/\/$/, '');

/**
 * Staging and preview deployments must not be indexed - a duplicate copy of
 * the shop competing with the real one in search results is a real cost, and
 * it is far easier to prevent than to undo.
 */
const indexable = process.env.NEXT_PUBLIC_ALLOW_INDEXING !== 'false';

export default function robots(): MetadataRoute.Robots {
  if (!indexable) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Nothing here is secret, but none of it belongs in an index either:
        // account pages need a session, and checkout URLs are single-use.
        disallow: [
          '/account',
          '/admin',
          '/api/',
          '/cart',
          '/checkout',
          '/order-confirmation',
          '/login',
          '/register',
          '/reset-password',
          '/verify-email',
          '/forgot-password',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
