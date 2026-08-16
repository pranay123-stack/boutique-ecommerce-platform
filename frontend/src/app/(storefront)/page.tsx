import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Truck, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/product/product-card';
import { serverFetch } from '@/lib/api';
import type { Homepage } from '@/types';

// The storefront home is revalidated rather than rendered per-request: it is
// the highest-traffic page and its content changes on merchandising cadence.
//
// Rendering it per request was measured at ~27 req/s against ~1,540 req/s
// cached - this page is 20+ product cards, and that render is the cost, not
// the API call. So it stays ISR-cached, and the stale build-time snapshot
// problem is solved by warming the cache at container start instead (see
// docker/frontend.Dockerfile).
export const revalidate = 120;

const GUARANTEES = [
  { icon: Truck, title: 'Free shipping over ₹1,999', body: 'Dispatched within 24 hours' },
  { icon: RefreshCw, title: '30-day returns', body: 'Unworn, with tags attached' },
  { icon: ShieldCheck, title: 'Secure payments', body: 'Verified server-side, every time' },
  { icon: Sparkles, title: 'Made in small batches', body: 'Never more than we can finish by hand' },
];

function Section({
  title, subtitle, href, products,
}: {
  title: string; subtitle?: string; href: string; products: Homepage['featured'];
}) {
  if (!products?.length) return null;
  return (
    <section className="container py-16" aria-labelledby={`${href.replace(/\W/g, '')}-heading`}>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 id={`${href.replace(/\W/g, '')}-heading`} className="display-heading text-3xl font-semibold sm:text-4xl">
            {title}
          </h2>
          {subtitle ? <p className="mt-2 text-muted-foreground">{subtitle}</p> : null}
        </div>
        <Button variant="ghost" asChild className="shrink-0">
          <Link href={href}>
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      <div className="product-grid">
        {products.slice(0, 8).map((product, i) => (
          <ProductCard key={product.id} product={product} priority={i < 4} />
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const data = await serverFetch<Homepage>('/content/homepage', 120);

  // Degrade to a usable page rather than an empty shell when the API is down.
  //
  // This used to fire routinely because the page was prerendered at build time
  // against an unreachable API (see the `dynamic` export above). It is now
  // what it should always have been: a genuine outage fallback rather than a
  // deploy-time certainty.
  const isEmpty =
    !data?.heroBanners?.length &&
    !data?.featured?.length &&
    !data?.newArrivals?.length &&
    !data?.bestSellers?.length &&
    !data?.categories?.length;

  if (!data || isEmpty) {
    return (
      <div className="container py-24 text-center">
        <h1 className="display-heading text-4xl font-semibold">Boutique</h1>
        <p className="mt-4 text-muted-foreground">
          Our catalogue is briefly unavailable. Please try again in a moment.
        </p>
        <Button asChild className="mt-8">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  const hero = data.heroBanners?.[0];

  return (
    <>
      {/* Hero */}
      {hero ? (
        <section className="relative overflow-hidden border-b border-border bg-secondary">
          <div className="container grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
            <div className="animate-fade-up">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                New season
              </p>
              <h1 className="display-heading mt-4 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                {hero.title}
              </h1>
              {hero.subtitle ? (
                <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
                  {hero.subtitle}
                </p>
              ) : null}
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <Link href={hero.linkUrl ?? '/products'}>{hero.ctaText ?? 'Shop now'}</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/products?sort=best_selling">Best sellers</Link>
                </Button>
              </div>
            </div>

            <div className="relative aspect-[4/3] overflow-hidden rounded-xl lg:aspect-[5/4]">
              <Image
                src={hero.imageUrl}
                alt={hero.title}
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* Guarantees */}
      <section className="border-b border-border" aria-label="Store guarantees">
        <div className="container grid gap-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {GUARANTEES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      {data.categories?.length ? (
        <section className="container py-16" aria-labelledby="categories-heading">
          <h2 id="categories-heading" className="display-heading text-3xl font-semibold sm:text-4xl">
            Shop by category
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.categories.map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="group relative aspect-[16/9] overflow-hidden rounded-lg bg-muted"
              >
                {category.imageUrl ? (
                  <Image
                    src={category.imageUrl}
                    alt={category.name}
                    fill
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                <div className="absolute bottom-4 left-5">
                  <h3 className="font-serif text-2xl font-semibold text-white">{category.name}</h3>
                  {category.productCount ? (
                    <p className="text-sm text-white/80">{category.productCount} pieces</p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <Section title="Featured" subtitle="Chosen by our buyers this month" href="/products?featured=true" products={data.featured} />

      {/* Promo strip */}
      {data.promoBanners?.[0] ? (
        <section className="bg-primary py-14 text-primary-foreground">
          <div className="container text-center">
            <h2 className="display-heading text-3xl font-semibold sm:text-4xl">
              {data.promoBanners[0].title}
            </h2>
            {data.promoBanners[0].subtitle ? (
              <p className="mx-auto mt-3 max-w-lg text-primary-foreground/80">
                {data.promoBanners[0].subtitle}
              </p>
            ) : null}
            <Button size="lg" variant="secondary" asChild className="mt-7">
              <Link href={data.promoBanners[0].linkUrl ?? '/products'}>
                {data.promoBanners[0].ctaText ?? 'Shop now'}
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      <Section title="New arrivals" subtitle="Fresh from the workshop" href="/products?sort=newest" products={data.newArrivals} />
      <Section title="Best sellers" subtitle="What our customers keep returning for" href="/products?sort=best_selling" products={data.bestSellers} />
    </>
  );
}
