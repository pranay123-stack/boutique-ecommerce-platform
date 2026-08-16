'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useCategoryTree } from '@/hooks/use-products';
import { useCreateProduct, useUpdateProduct } from '@/hooks/use-admin';
import { ImageUploader, type UploadedImage } from './image-uploader';

interface VariantDraft {
  sku: string;
  name: string;
  price: string;
  discountPrice: string;
  stockQuantity: string;
  size: string;
  colour: string;
}

const emptyVariant = (): VariantDraft => ({
  sku: '', name: '', price: '', discountPrice: '', stockQuantity: '0', size: '', colour: '',
});

/** Statutory GST slabs. Anything else is a data-entry error, not a rate. */
const GST_SLABS = ['0', '0.25', '3', '5', '12', '18', '28'] as const;

/**
 * The API returns rates as fixed-point strings ("12.00"), which would match
 * none of the options above and silently reset an existing product to the
 * first slab when someone opens it to edit an unrelated field.
 */
function toSlab(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '5';
  const match = GST_SLABS.find((slab) => Number(slab) === numeric);
  return match ?? String(numeric);
}

export function ProductForm({ initial }: { initial?: any }) {
  const router = useRouter();
  const { data: categories } = useCategoryTree();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [form, setForm] = useState({
    name: initial?.name ?? '',
    brand: initial?.brand ?? '',
    categoryId: initial?.categoryId ?? '',
    basePrice: initial?.basePrice ?? '',
    compareAtPrice: initial?.compareAtPrice ?? '',
    taxRatePercent: toSlab(initial?.taxRatePercent ?? 5),
    hsnCode: initial?.hsnCode ?? '',
    shortDescription: initial?.shortDescription ?? '',
    description: initial?.description ?? '',
    status: initial?.status ?? 'DRAFT',
    isFeatured: initial?.isFeatured ?? false,
    isNewArrival: initial?.isNewArrival ?? true,
    tags: (initial?.tags ?? []).join(', '),
  });

  const [images, setImages] = useState<UploadedImage[]>(
    (initial?.images ?? []).map((img: any, i: number) => ({
      url: img.url, alt: img.alt ?? undefined, isPrimary: img.isPrimary ?? i === 0, position: i,
    })),
  );

  const [variants, setVariants] = useState<VariantDraft[]>(
    initial?.variants?.length
      ? initial.variants.map((v: any) => ({
          sku: v.sku,
          name: v.name,
          price: String(v.price),
          discountPrice: v.discountPrice ? String(v.discountPrice) : '',
          stockQuantity: String(v.inventory?.quantity ?? 0),
          size: v.attributeValues?.find((a: any) => a.attributeValue.attribute.name === 'Size')?.attributeValue.value ?? '',
          colour: v.attributeValues?.find((a: any) => a.attributeValue.attribute.name === 'Colour')?.attributeValue.value ?? '',
        }))
      : [emptyVariant()],
  );

  // Flatten the category tree so subcategories are selectable too.
  const flatCategories: Array<{ id: string; name: string; depth: number }> = [];
  const walk = (nodes: any[], depth = 0) => {
    nodes?.forEach((node) => {
      flatCategories.push({ id: node.id, name: node.name, depth });
      if (node.children?.length) walk(node.children, depth + 1);
    });
  };
  walk(categories ?? []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name: form.name,
      brand: form.brand || undefined,
      categoryId: form.categoryId,
      basePrice: Number(form.basePrice),
      compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : undefined,
      taxRatePercent: Number(form.taxRatePercent || 0),
      hsnCode: form.hsnCode.trim() || undefined,
      shortDescription: form.shortDescription || undefined,
      description: form.description || undefined,
      status: form.status,
      isFeatured: form.isFeatured,
      isNewArrival: form.isNewArrival,
      tags: form.tags ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      images: images.map((img, i) => ({
        url: img.url,
        alt: img.alt ?? form.name,
        position: i,
        isPrimary: img.isPrimary ?? i === 0,
      })),
      variants: variants.map((v, i) => ({
        sku: v.sku,
        name: v.name || [v.colour, v.size].filter(Boolean).join(' / ') || `Variant ${i + 1}`,
        price: Number(v.price || form.basePrice),
        discountPrice: v.discountPrice ? Number(v.discountPrice) : undefined,
        stockQuantity: Number(v.stockQuantity || 0),
        attributes: [
          ...(v.colour ? [{ attributeName: 'Colour', value: v.colour }] : []),
          ...(v.size ? [{ attributeName: 'Size', value: v.size }] : []),
        ],
        position: i,
      })),
    };

    if (initial?.id) {
      await updateProduct.mutateAsync({ id: initial.id, ...payload });
    } else {
      await createProduct.mutateAsync(payload);
    }
    router.push('/admin/products');
  };

  const setVariant = (index: number, patch: Partial<VariantDraft>) =>
    setVariants((list) => list.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
              <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="brand">Brand</Label>
              <Input id="brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="category">Category <span className="text-destructive">*</span></Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                <SelectTrigger id="category" className="mt-1.5"><SelectValue placeholder="Choose a category" /></SelectTrigger>
                <SelectContent>
                  {flatCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{' '.repeat(c.depth * 3)}{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="basePrice">Base price <span className="text-destructive">*</span></Label>
              <Input id="basePrice" type="number" step="0.01" required value={form.basePrice}
                onChange={(e) => setForm({ ...form, basePrice: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="compareAtPrice">Compare-at price</Label>
              <Input id="compareAtPrice" type="number" step="0.01" value={form.compareAtPrice}
                onChange={(e) => setForm({ ...form, compareAtPrice: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="taxRatePercent">GST rate</Label>
              {/*
                A select, not a number field: GST has statutory slabs, and a
                typo like 15% would be charged to real customers and reported
                on a real return. The API rejects anything off this list too.
              */}
              <select
                id="taxRatePercent"
                value={form.taxRatePercent}
                onChange={(e) => setForm({ ...form, taxRatePercent: e.target.value })}
                className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {GST_SLABS.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}%
                  </option>
                ))}
                {/* Preserve a legacy off-slab rate rather than silently
                    rewriting it; the API will reject it on save, which is the
                    correct prompt to fix it deliberately. */}
                {GST_SLABS.includes(form.taxRatePercent as (typeof GST_SLABS)[number]) ? null : (
                  <option value={form.taxRatePercent}>{form.taxRatePercent}% (not a GST slab)</option>
                )}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="hsnCode">HSN code</Label>
              <Input
                id="hsnCode"
                value={form.hsnCode}
                onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
                placeholder="6204"
                inputMode="numeric"
                pattern="\d{4,8}"
                maxLength={8}
                className="mt-1.5"
                aria-describedby="hsnCode-hint"
              />
              <p id="hsnCode-hint" className="mt-1.5 text-xs text-muted-foreground">
                Printed on every tax invoice. Leave blank to classify from the category —
                unclassified goods fall back to 9999 at 18%.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="shortDescription">Short description</Label>
            <Input id="shortDescription" value={form.shortDescription}
              onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="description">Full description</Label>
            <Textarea id="description" rows={5} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="tags">Tags (comma separated)</Label>
            <Input id="tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="mt-1.5" />
          </div>

          <ImageUploader images={images} onChange={setImages} />

          <Separator />

          <div className="flex flex-wrap items-center gap-6">
            <div className="w-40">
              <Label htmlFor="status">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger id="status" className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="isFeatured" checked={form.isFeatured}
                onCheckedChange={(v) => setForm({ ...form, isFeatured: Boolean(v) })} />
              <Label htmlFor="isFeatured" className="cursor-pointer font-normal">Featured</Label>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="isNewArrival" checked={form.isNewArrival}
                onCheckedChange={(v) => setForm({ ...form, isNewArrival: Boolean(v) })} />
              <Label htmlFor="isNewArrival" className="cursor-pointer font-normal">New arrival</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variants</CardTitle>
          <CardDescription>Every product needs at least one variant with its own SKU and stock.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {variants.map((variant, index) => (
            <div key={index} className="rounded-lg border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium">Variant {index + 1}</span>
                {variants.length > 1 ? (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove variant"
                    onClick={() => setVariants((l) => l.filter((_, i) => i !== index))}>
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                ) : null}
              </div>
              {/* Each label is bound to its input by id: without htmlFor the
                  fields are unlabelled for screen readers and for any
                  accessibility-driven query. */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor={`variant-${index}-sku`}>SKU <span className="text-destructive">*</span></Label>
                  <Input id={`variant-${index}-sku`} required value={variant.sku}
                    onChange={(e) => setVariant(index, { sku: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor={`variant-${index}-colour`}>Colour</Label>
                  <Input id={`variant-${index}-colour`} value={variant.colour}
                    onChange={(e) => setVariant(index, { colour: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor={`variant-${index}-size`}>Size</Label>
                  <Input id={`variant-${index}-size`} value={variant.size}
                    onChange={(e) => setVariant(index, { size: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor={`variant-${index}-price`}>Price <span className="text-destructive">*</span></Label>
                  <Input id={`variant-${index}-price`} type="number" step="0.01" required value={variant.price}
                    onChange={(e) => setVariant(index, { price: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor={`variant-${index}-discount`}>Discount price</Label>
                  <Input id={`variant-${index}-discount`} type="number" step="0.01" value={variant.discountPrice}
                    onChange={(e) => setVariant(index, { discountPrice: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor={`variant-${index}-stock`}>Stock</Label>
                  <Input id={`variant-${index}-stock`} type="number" value={variant.stockQuantity}
                    onChange={(e) => setVariant(index, { stockQuantity: e.target.value })} className="mt-1.5" />
                </div>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={() => setVariants((l) => [...l, emptyVariant()])}>
            <Plus className="h-4 w-4" /> Add variant
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" loading={createProduct.isPending || updateProduct.isPending}>
          {initial?.id ? 'Save changes' : 'Create product'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/admin/products')}>Cancel</Button>
      </div>
    </form>
  );
}
