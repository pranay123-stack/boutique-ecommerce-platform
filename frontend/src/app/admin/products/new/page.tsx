'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductForm } from '@/components/admin/product-form';

export default function NewProductPage() {
  return (
    <div className="space-y-5">
      <Button variant="ghost" asChild className="-ml-3">
        <Link href="/admin/products"><ArrowLeft className="h-4 w-4" /> Products</Link>
      </Button>
      <h1 className="text-2xl font-semibold">New product</h1>
      <ProductForm />
    </div>
  );
}
