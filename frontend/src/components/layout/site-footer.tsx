import Link from 'next/link';

const SECTIONS = [
  {
    title: 'Shop',
    links: [
      { label: 'All products', href: '/products' },
      { label: 'New arrivals', href: '/products?sort=newest' },
      { label: 'Best sellers', href: '/products?sort=best_selling' },
      { label: 'Women', href: '/category/women' },
      { label: 'Accessories', href: '/category/accessories' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', href: '/login' },
      { label: 'Create account', href: '/register' },
      { label: 'My orders', href: '/account/orders' },
      { label: 'Track an order', href: '/track-order' },
      { label: 'Wishlist', href: '/account/wishlist' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Shipping', href: '/shipping' },
      { label: 'Returns', href: '/returns' },
      { label: 'Contact', href: '/contact' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Photo credits', href: '/credits' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-muted/40">
      <div className="container py-16">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <h2 className="font-serif text-2xl font-semibold">Boutique</h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Hand-finished clothing, accessories and homeware. Made in small batches by
              people we know, from materials we can account for.
            </p>
          </div>

          {SECTIONS.map((section) => (
            <nav key={section.title} aria-label={section.title}>
              <h3 className="text-sm font-semibold">{section.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Boutique Commerce. All rights reserved.</p>
          <p>Secure payments · Free shipping over ₹1,999 · 30-day returns</p>
        </div>
      </div>
    </footer>
  );
}
