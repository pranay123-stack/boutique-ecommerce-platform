'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import type { Facets } from '@/types';
import type { ProductQuery } from '@/hooks/use-products';

interface Props {
  facets?: Facets;
  query: ProductQuery;
  onChange: (patch: Partial<ProductQuery>) => void;
  onReset: () => void;
}

export function ProductFilters({ facets, query, onChange, onReset }: Props) {
  const [minPrice, setMinPrice] = useState(query.minPrice?.toString() ?? '');
  const [maxPrice, setMaxPrice] = useState(query.maxPrice?.toString() ?? '');

  const toggle = (list: string[] | undefined, value: string): string[] => {
    const current = list ?? [];
    return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  };

  const activeCount =
    (query.brands?.length ?? 0) +
    (query.attributes?.length ?? 0) +
    (query.minPrice !== undefined ? 1 : 0) +
    (query.maxPrice !== undefined ? 1 : 0) +
    (query.inStock ? 1 : 0);

  const applyPrice = () => {
    onChange({
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      page: 1,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Filters</h2>
        {activeCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMinPrice('');
              setMaxPrice('');
              onReset();
            }}
          >
            Clear ({activeCount})
          </Button>
        ) : null}
      </div>

      <Separator />

      {/* Availability */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="filter-stock"
          checked={Boolean(query.inStock)}
          onCheckedChange={(checked) => onChange({ inStock: Boolean(checked), page: 1 })}
        />
        <Label htmlFor="filter-stock" className="cursor-pointer font-normal">
          In stock only
        </Label>
      </div>

      <Separator />

      {/* Price */}
      <div>
        <h3 className="mb-3 text-sm font-medium">Price</h3>
        {facets?.priceRange ? (
          <p className="mb-2 text-xs text-muted-foreground">
            {formatMoney(facets.priceRange.min)} – {formatMoney(facets.priceRange.max)}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="Min"
            aria-label="Minimum price"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="h-9"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="Max"
            aria-label="Maximum price"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="h-9"
          />
        </div>
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={applyPrice}>
          Apply
        </Button>
      </div>

      {/* Brands */}
      {facets?.brands?.length ? (
        <>
          <Separator />
          <div>
            <h3 className="mb-3 text-sm font-medium">Brand</h3>
            <ul className="space-y-2">
              {facets.brands.map((brand) => (
                <li key={brand.name} className="flex items-center gap-2">
                  <Checkbox
                    id={`brand-${brand.name}`}
                    checked={query.brands?.includes(brand.name) ?? false}
                    onCheckedChange={() => onChange({ brands: toggle(query.brands, brand.name), page: 1 })}
                  />
                  <Label htmlFor={`brand-${brand.name}`} className="flex-1 cursor-pointer font-normal">
                    {brand.name}
                  </Label>
                  <span className="text-xs text-muted-foreground">{brand.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {/* Attribute facets: colour renders as swatches, everything else as checkboxes */}
      {facets?.attributes?.map((attribute) => (
        <div key={attribute.name}>
          <Separator className="mb-6" />
          <h3 className="mb-3 text-sm font-medium">{attribute.name}</h3>

          {attribute.values.some((v) => v.hexColor) ? (
            <div className="flex flex-wrap gap-2">
              {attribute.values.map((value) => {
                const selected = query.attributes?.includes(value.slug) ?? false;
                return (
                  <button
                    key={value.slug}
                    type="button"
                    title={`${value.value} (${value.count})`}
                    aria-label={`${value.value}, ${value.count} products`}
                    aria-pressed={selected}
                    onClick={() => onChange({ attributes: toggle(query.attributes, value.slug), page: 1 })}
                    className={cn(
                      'h-8 w-8 rounded-full border-2 transition-all',
                      selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50',
                    )}
                    style={{ backgroundColor: value.hexColor ?? '#ccc' }}
                  />
                );
              })}
            </div>
          ) : (
            <ul className="space-y-2">
              {attribute.values.slice(0, 12).map((value) => (
                <li key={value.slug} className="flex items-center gap-2">
                  <Checkbox
                    id={`attr-${value.slug}`}
                    checked={query.attributes?.includes(value.slug) ?? false}
                    onCheckedChange={() => onChange({ attributes: toggle(query.attributes, value.slug), page: 1 })}
                  />
                  <Label htmlFor={`attr-${value.slug}`} className="flex-1 cursor-pointer font-normal">
                    {value.value}
                  </Label>
                  <span className="text-xs text-muted-foreground">{value.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export function ActiveFilterChips({ query, onChange }: { query: ProductQuery; onChange: (p: Partial<ProductQuery>) => void }) {
  const chips: Array<{ label: string; clear: () => void }> = [];

  query.brands?.forEach((brand) =>
    chips.push({ label: brand, clear: () => onChange({ brands: query.brands?.filter((b) => b !== brand), page: 1 }) }),
  );
  query.attributes?.forEach((attr) =>
    chips.push({
      label: attr.replace(/^(colour|size|material)-/, ''),
      clear: () => onChange({ attributes: query.attributes?.filter((a) => a !== attr), page: 1 }),
    }),
  );
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    chips.push({
      label: `${query.minPrice ?? 0} – ${query.maxPrice ?? '∞'}`,
      clear: () => onChange({ minPrice: undefined, maxPrice: undefined, page: 1 }),
    });
  }
  if (query.inStock) chips.push({ label: 'In stock', clear: () => onChange({ inStock: false, page: 1 }) });

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip, i) => (
        <Badge key={`${chip.label}-${i}`} variant="secondary" className="gap-1 py-1 pr-1 capitalize">
          {chip.label}
          <button type="button" onClick={chip.clear} aria-label={`Remove ${chip.label} filter`} className="rounded-full p-0.5 hover:bg-background/60">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
