import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Add to bag</Button>);
    expect(screen.getByRole('button', { name: 'Add to bag' })).toBeInTheDocument();
  });

  it('calls the click handler', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Buy</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire while loading', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Paying</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Sold out</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies the destructive variant', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button').className).toContain('bg-destructive');
  });

  it('renders as a child element when asChild is set', () => {
    render(<Button asChild><a href="/checkout">Checkout</a></Button>);
    expect(screen.getByRole('link', { name: 'Checkout' })).toHaveAttribute('href', '/checkout');
  });
});
