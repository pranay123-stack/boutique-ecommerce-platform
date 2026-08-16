'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Package, ShoppingCart, Users, Boxes,
  Ticket, Star, Image as ImageIcon, LogOut, Store, BarChart3, PackageOpen, Mail } from 'lucide-react';
import { RequireAuth } from '@/components/account/require-auth';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/hooks/use-auth';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/coupons', label: 'Coupons', icon: Ticket },
  { href: '/admin/returns', label: 'Returns', icon: PackageOpen },
  { href: '/admin/reviews', label: 'Reviews', icon: Star },
  { href: '/admin/messages', label: 'Messages', icon: Mail },
  { href: '/admin/content', label: 'Content', icon: ImageIcon },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const logout = useLogout();
  const user = useAuthStore((s) => s.user);

  return (
    <RequireAuth roles={['ADMIN', 'MANAGER', 'SUPPORT']}>
      <div className="flex min-h-screen bg-muted/30">
        {/* Sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-border bg-background lg:flex lg:flex-col">
          <div className="border-b border-border p-5">
            <Link href="/admin" className="font-serif text-xl font-semibold">
              Boutique
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">Business console</p>
          </div>

          <nav className="flex-1 space-y-0.5 p-3" aria-label="Admin">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border p-3">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium">{user?.firstName}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.role}</p>
            </div>
            <Button variant="ghost" className="w-full justify-start gap-3 px-3 text-muted-foreground" asChild>
              <Link href="/"><Store className="h-4 w-4" /> View storefront</Link>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-3 text-muted-foreground hover:text-destructive"
              onClick={() => logout.mutate()}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </aside>

        {/* Mobile nav */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-border bg-background p-3 lg:hidden">
            <div className="flex items-center justify-between">
              <Link href="/admin" className="font-serif text-lg font-semibold">Boutique admin</Link>
              <Button variant="ghost" size="sm" asChild><Link href="/">Storefront</Link></Button>
            </div>
            <nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="Admin mobile">
              {NAV.map(({ href, label }) => {
                const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'whitespace-nowrap rounded-md px-3 py-1.5 text-sm',
                      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <main id="main" className="flex-1 overflow-x-hidden p-5 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </RequireAuth>
  );
}
