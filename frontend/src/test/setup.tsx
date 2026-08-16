import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// next/image renders a plain img in tests - the real component needs a Next
// server for optimisation, which is out of scope for component tests.
vi.mock('next/image', () => ({
  default: (props: any) => {
    // next/image needs a Next server for optimisation, so tests render a plain
    // img. The lint rules below are about production output, not this mock.
    const { fill, priority, sizes, alt, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt ?? ''} {...rest} />;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// jsdom lacks these browser APIs that Radix and our components touch.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
});
window.HTMLElement.prototype.scrollIntoView = () => {};
