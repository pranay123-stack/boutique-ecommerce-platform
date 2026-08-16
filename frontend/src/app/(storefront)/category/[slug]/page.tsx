import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { ProductBrowser } from '../../products/product-browser';
import { serverFetch } from '@/lib/api';
import type { Category } from '@/types';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await serverFetch<Category>(`/categories/${slug}`, 300);
  if (!category) return { title: 'Category' };
  return {
    title: category.name,
    description: category.description ?? `Shop ${category.name} at Boutique.`,
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = await serverFetch<Category & { parent?: Category; children?: Category[] }>(
    `/categories/${slug}`,
    300,
  );
  if (!category) notFound();

  return (
    <>
      <nav aria-label="Breadcrumb" className="container pt-8">
        <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <li><Link href="/" className="hover:text-foreground">Home</Link></li>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          {category.parent ? (
            <>
              <li>
                <Link href={`/category/${category.parent.slug}`} className="hover:text-foreground">
                  {category.parent.name}
                </Link>
              </li>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </>
          ) : null}
          <li className="font-medium text-foreground" aria-current="page">{category.name}</li>
        </ol>
      </nav>

      {category.children?.length ? (
        <div className="container mt-6 flex flex-wrap gap-2">
          {category.children.map((child) => (
            <Link
              key={child.id}
              href={`/category/${child.slug}`}
              className="rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
            >
              {child.name}
            </Link>
          ))}
        </div>
      ) : null}

      <Suspense fallback={<div className="container py-16">Loading…</div>}>
        <ProductBrowser fixedCategory={slug} title={category.name} />
      </Suspense>
    </>
  );
}
