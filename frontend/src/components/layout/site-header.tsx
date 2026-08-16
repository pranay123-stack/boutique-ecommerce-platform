'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Menu, Search, ShoppingBag, User, Heart, LogOut, LayoutDashboard, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCart } from '@/hooks/use-cart';
import { useCategoryTree } from '@/hooks/use-products';
import { useAuthStore } from '@/store/auth-store';
import { useLogout } from '@/hooks/use-auth';
import { CartDrawer } from '@/components/cart/cart-drawer';
import { useUIStore } from '@/store/ui-store';

export function SiteHeader() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: cart } = useCart();
  const { data: categories } = useCategoryTree();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const { cartOpen, setCartOpen } = useUIStore();

  const itemCount = cart?.itemCount ?? 0;
  const isStaff = user && user.role !== 'CUSTOMER';

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = query.trim();
    if (term) router.push(`/products?q=${encodeURIComponent(term)}`);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="bg-primary px-4 py-2 text-center text-xs text-primary-foreground">
        Complimentary shipping on orders over ₹1,999
      </div>

      <div className="container flex h-16 items-center gap-4">
        {/* Mobile navigation */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80">
            <SheetHeader>
              <SheetTitle className="font-serif text-2xl">Boutique</SheetTitle>
            </SheetHeader>
            <nav className="flex-1 overflow-y-auto p-6" aria-label="Mobile">
              <ul className="space-y-5">
                {categories?.map((category) => (
                  <li key={category.id}>
                    <Link
                      href={`/category/${category.slug}`}
                      onClick={() => setMobileOpen(false)}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {category.name}
                    </Link>
                    {category.children?.length ? (
                      <ul className="ml-3 mt-2 space-y-2 border-l border-border pl-4">
                        {category.children.map((child) => (
                          <li key={child.id}>
                            <Link
                              href={`/category/${child.slug}`}
                              onClick={() => setMobileOpen(false)}
                              className="text-sm text-muted-foreground hover:text-primary"
                            >
                              {child.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
                <li className="border-t border-border pt-5">
                  <Link href="/products" onClick={() => setMobileOpen(false)} className="font-medium">
                    All products
                  </Link>
                </li>
              </ul>
            </nav>
          </SheetContent>
        </Sheet>

        <Link href="/" className="shrink-0 font-serif text-2xl font-semibold tracking-tight">
          Boutique
        </Link>

        <nav className="hidden lg:flex lg:items-center lg:gap-6" aria-label="Primary">
          {categories?.slice(0, 4).map((category) => (
            <div key={category.id} className="group relative">
              <Link
                href={`/category/${category.slug}`}
                className="py-2 text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
              >
                {category.name}
              </Link>
              {category.children?.length ? (
                <div className="invisible absolute left-0 top-full z-50 min-w-48 rounded-md border border-border bg-popover p-2 opacity-0 shadow-md transition-all group-hover:visible group-hover:opacity-100">
                  {category.children.map((child) => (
                    <Link
                      key={child.id}
                      href={`/category/${child.slug}`}
                      className="block rounded-sm px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
                    >
                      {child.name}
                      <span className="ml-2 text-xs text-muted-foreground">{child.productCount}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <form onSubmit={onSearch} className="ml-auto hidden max-w-xs flex-1 md:block" role="search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the boutique"
              aria-label="Search products"
              className="pl-9"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Button variant="ghost" size="icon" asChild className="md:hidden" aria-label="Search">
            <Link href="/products">
              <Search className="h-5 w-5" />
            </Link>
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account menu">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{user.firstName}</div>
                  <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isStaff ? (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <LayoutDashboard className="h-4 w-4" /> Admin dashboard
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                  <Link href="/account">
                    <User className="h-4 w-4" /> My account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account/orders">
                    <Package className="h-4 w-4" /> Orders
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account/wishlist">
                    <Heart className="h-4 w-4" /> Wishlist
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout.mutate()}>
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="ghost" size="icon" asChild aria-label="Sign in">
              <Link href="/login">
                <User className="h-5 w-5" />
              </Link>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setCartOpen(true)}
            aria-label={`Shopping bag, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
          >
            <ShoppingBag className="h-5 w-5" />
            {itemCount > 0 ? (
              <Badge className="absolute -right-0.5 -top-0.5 h-5 min-w-5 justify-center px-1 text-[10px]">
                {itemCount}
              </Badge>
            ) : null}
          </Button>
        </div>
      </div>

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </header>
  );
}
