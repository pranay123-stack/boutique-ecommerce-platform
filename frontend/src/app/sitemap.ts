import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100').replace(/\/$/, '');
// Server-side fetch, so it must be an absolute origin - the /api/proxy
// rewrite the browser uses does not exist here.
const API_URL = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4100';

/**
 * Rendered per request, not at build time.
 *
 * Prerendering this during `next build` bakes in whatever the API returned
 * then - and inside a Docker build there is no compose network, so the API is
 * unreachable and the catch below returns the static routes only. That empty
 * sitemap would then be served for an hour after every deploy, telling search
 * engines the catalogue does not exist.
 *
 * The upstream fetches are still cached for an hour (see `revalidate` on each
 * one), so this costs one API round trip per hour, not one per crawl.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

interface Listed {
  slug: string;
  updatedAt?: string;
  createdAt?: string;
}

interface CategoryNode extends Listed {
  children?: CategoryNode[];
}

/**
 * Categories are served as a tree, not a page. Flattening it here rather than
 * paging is not a shortcut - a nested child category has its own storefront
 * page and must appear in the sitemap, and only a recursive walk finds them.
 */
async function fetchCategoryTree(): Promise<Listed[]> {
  const res = await fetch(`${API_URL}/api/v1/categories/tree`, { next: { revalidate } });
  if (!res.ok) {
    console.error(`[sitemap] categories failed: ${res.status}`);
    return [];
  }
  const body = await res.json();
  const flat: Listed[] = [];
  const walk = (nodes: CategoryNode[] = []) => {
    for (const node of nodes) {
      if (node.slug) flat.push(node);
      walk(node.children);
    }
  };
  walk(body?.data ?? []);
  return flat;
}

/**
 * Fetch every page of a listing.
 *
 * A sitemap that silently stops at the first 100 products is worse than no
 * sitemap: it tells search engines the rest of the catalogue does not exist.
 * The page cap is a safety limit against an unbounded crawl, and it is logged
 * rather than passed over in silence.
 */
async function fetchAll(path: string, label: string): Promise<Listed[]> {
  const all: Listed[] = [];
  const MAX_PAGES = 100;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const res = await fetch(`${API_URL}/api/v1${path}${separator}page=${page}&limit=100`, {
      next: { revalidate },
    });
    if (!res.ok) {
      console.error(`[sitemap] ${label} page ${page} failed: ${res.status}`);
      break;
    }
    const body = await res.json();
    const items: Listed[] = body?.data ?? [];
    all.push(...items);
    if (!body?.meta?.hasNext) return all;
    if (page === MAX_PAGES) {
      console.warn(`[sitemap] ${label} truncated at ${MAX_PAGES} pages (${all.length} entries)`);
    }
  }
  return all;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/track-order`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/shipping`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/returns`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  try {
    const [products, categories] = await Promise.all([
      fetchAll('/products', 'products'),
      fetchCategoryTree(),
    ]);

    return [
      ...staticRoutes,
      ...categories.map((c) => ({
        url: `${SITE_URL}/category/${c.slug}`,
        lastModified: c.updatedAt ? new Date(c.updatedAt) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
      ...products.map((p) => ({
        url: `${SITE_URL}/products/${p.slug}`,
        lastModified: new Date(p.updatedAt ?? p.createdAt ?? now),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ];
  } catch (err) {
    // A sitemap with the static routes still helps; failing the build over a
    // transient API error does not.
    console.error('[sitemap] falling back to static routes:', err);
    return staticRoutes;
  }
}
