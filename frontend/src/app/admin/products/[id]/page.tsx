'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductForm } from '@/components/admin/product-form';
import { api } from '@/lib/api';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => api.get<any>(`/admin/products/${id}`),
  });

  return (
    <div className="space-y-5">
      <Button variant="ghost" asChild className="-ml-3">
        <Link href="/admin/products"><ArrowLeft className="h-4 w-4" /> Products</Link>
      </Button>
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{data?.name}</h1>
          <ProductForm initial={data} />
        </>
      )}
    </div>
  );
}
