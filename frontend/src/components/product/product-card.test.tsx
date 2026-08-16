import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductCard } from './product-card';
import type { Product } from '@/types';

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Hand-Rolled Silk Scarf',
  slug: 'hand-rolled-silk-scarf',
  brand: 'Atelier Rive',
  basePrice: '2450.00',
  compareAtPrice: '3200.00',
  ratingAverage: '4.5',
  ratingCount: 12,
  images: [{ url: '/img.svg', alt: 'Scarf' }],
  variants: [],
  primaryImage: '/img.svg',
  effectivePrice: 2450,
  discountPercent: 23,
  inStock: true,
  ...over,
});

describe('ProductCard', () => {
  it('renders name, brand and price', () => {
    render(<ProductCard product={product()} />);
    expect(screen.getByText('Hand-Rolled Silk Scarf')).toBeInTheDocument();
    expect(screen.getByText('Atelier Rive')).toBeInTheDocument();
    expect(screen.getByText('₹2,450')).toBeInTheDocument();
  });

  it('shows the struck-through compare-at price when discounted', () => {
    render(<ProductCard product={product()} />);
    expect(screen.getByText('₹3,200')).toBeInTheDocument();
    expect(screen.getByText('−23%')).toBeInTheDocument();
  });

  it('hides the discount badge at full price', () => {
    render(<ProductCard product={product({ compareAtPrice: null, discountPercent: 0 })} />);
    expect(screen.queryByText(/−\d+%/)).not.toBeInTheDocument();
  });

  it('marks a sold-out product', () => {
    render(<ProductCard product={product({ inStock: false })} />);
    expect(screen.getByText('Sold out')).toBeInTheDocument();
  });

  it('flags a new arrival', () => {
    render(<ProductCard product={product({ isNewArrival: true })} />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('links to the product detail page', () => {
    render(<ProductCard product={product()} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/products/hand-rolled-silk-scarf');
  });

  it('exposes an accessible rating label', () => {
    render(<ProductCard product={product()} />);
    expect(screen.getByLabelText('Rated 4.5 out of 5')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
  });

  it('omits the rating block when there are no reviews', () => {
    render(<ProductCard product={product({ ratingCount: 0 })} />);
    expect(screen.queryByLabelText(/Rated/)).not.toBeInTheDocument();
  });
});
