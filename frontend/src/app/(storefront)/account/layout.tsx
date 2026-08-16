'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Package, MapPin, Heart, LogOut, Star, PackageOpen } from 'lucide-react';
import { RequireAuth } from '@/components/account/require-auth';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/account', label: 'Profile', icon: User },
  { href: '/account/orders', label: 'Orders', icon: Package },
  { href: '/account/returns', label: 'Returns', icon: PackageOpen },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
  { href: '/account/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/account/reviews', label: 'Reviews', icon: Star },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const logout = useLogout();

  return (
    <RequireAuth>
      <div className="container py-12">
        <h1 className="display-heading text-4xl font-semibold">My account</h1>

        <div className="mt-8 grid gap-10 lg:grid-cols-[220px_1fr]">
          <nav aria-label="Account" className="lg:sticky lg:top-28 lg:h-fit">
            <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || (href !== '/account' && pathname.startsWith(href));
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn(
                        'flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
                        active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </Link>
                  </li>
                );
              })}
              <li className="lg:mt-2 lg:border-t lg:border-border lg:pt-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2.5 px-3 text-muted-foreground hover:text-destructive"
                  onClick={() => logout.mutate()}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </Button>
              </li>
            </ul>
          </nav>

          <div>{children}</div>
        </div>
      </div>
    </RequireAuth>
  );
}
