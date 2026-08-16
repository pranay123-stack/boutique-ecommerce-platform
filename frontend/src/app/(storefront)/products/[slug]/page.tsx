import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { ProductDetail } from '@/components/product/product-detail';
import { ProductCard } from '@/components/product/product-card';
import { serverFetch } from '@/lib/api';
import type { Product } from '@/types';

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await serverFetch<Product>(`/products/${slug}`, 300);
  if (!product) return { title: 'Product not found' };

  return {
    title: product.name,
    description: product.shortDescription ?? product.description?.slice(0, 160) ?? undefined,
    openGraph: {
      title: product.name,
      description: product.shortDescription ?? undefined,
      images: product.images?.[0]?.url ? [{ url: product.images[0].url }] : undefined,
      type: 'website',
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [product, related] = await Promise.all([
    serverFetch<Product>(`/products/${slug}`, 300),
    serverFetch<Product[]>(`/products/${slug}/related`, 300),
  ]);

  if (!product) notFound();

  // Structured data lets search engines show price and availability directly.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? product.description ?? undefined,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    sku: product.variants?.[0]?.sku,
    image: product.images?.map((i) => i.url),
    offers: {
      '@type': 'Offer',
      price: product.variants?.[0]?.discountPrice ?? product.basePrice,
      priceCurrency: product.currency ?? 'INR',
      availability: product.variants?.some((v) => v.available > 0)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.ratingAverage,
            reviewCount: product.ratingCount,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="container pt-8">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <li><Link href="/" className="hover:text-foreground">Home</Link></li>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <li><Link href="/products" className="hover:text-foreground">Products</Link></li>
          {product.category ? (
            <>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              <li>
                <Link href={`/category/${product.category.slug}`} className="hover:text-foreground">
                  {product.category.name}
                </Link>
              </li>
            </>
          ) : null}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <li className="font-medium text-foreground" aria-current="page">{product.name}</li>
        </ol>
      </nav>

      <ProductDetail product={product} />

      {related?.length ? (
        <section className="container pb-16" aria-labelledby="related-heading">
          <h2 id="related-heading" className="display-heading mb-8 text-3xl font-semibold">
            You may also like
          </h2>
          <div className="product-grid">
            {related.slice(0, 4).map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
