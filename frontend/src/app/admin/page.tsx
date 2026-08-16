'use client';

import Link from 'next/link';
import {
  IndianRupee, ShoppingCart, Users, AlertTriangle, TrendingUp,
  Package, ArrowRight, RotateCcw,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useBestSellers, useDashboard, useSalesSeries, useRevenueByCategory } from '@/hooks/use-admin';
import { formatMoney, formatNumber } from '@/lib/format';

function StatCard({
  label, value, sub, icon: Icon, tone = 'default', href,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; tone?: 'default' | 'warning'; href?: string;
}) {
  const body = (
    <Card className={tone === 'warning' ? 'border-warning/40' : undefined}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 truncate text-2xl font-semibold tabular-nums">{value}</p>
            {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
          </div>
          <div className={`rounded-md p-2 ${tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block transition-opacity hover:opacity-90">{body}</Link> : body;
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useDashboard();
  const { data: series } = useSalesSeries();
  const { data: bestSellers } = useBestSellers(6);
  const { data: byCategory } = useRevenueByCategory();

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last 30 days</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net revenue"
          value={formatMoney(stats.revenue.net)}
          sub={`${formatMoney(stats.revenue.gross)} gross · ${formatMoney(stats.revenue.refunded)} refunded`}
          icon={IndianRupee}
        />
        <StatCard
          label="Paid orders"
          value={formatNumber(stats.orders.paid)}
          sub={`${stats.orders.conversionRate}% of ${stats.orders.total} placed`}
          icon={ShoppingCart}
          href="/admin/orders"
        />
        <StatCard
          label="Customers"
          value={formatNumber(stats.customers.total)}
          sub={`${stats.customers.new} new this period`}
          icon={Users}
          href="/admin/customers"
        />
        <StatCard
          label="Low stock"
          value={formatNumber(stats.alerts.lowStockVariants)}
          sub="variants at or below threshold"
          icon={AlertTriangle}
          tone={stats.alerts.lowStockVariants > 0 ? 'warning' : 'default'}
          href="/admin/inventory"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Revenue</CardTitle>
            <CardDescription>Daily captured revenue over the period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series ?? []} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => d.slice(5)}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) =>
                      name === 'revenue' ? [formatMoney(value), 'Revenue'] : [value, 'Orders']
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#revenueFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operations</CardTitle>
            <CardDescription>What needs attention now</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/admin/orders?status=PAYMENT_CONFIRMED" className="flex items-center justify-between rounded-md border border-border p-3 text-sm transition-colors hover:bg-accent">
              <span className="flex items-center gap-2"><Package className="h-4 w-4" /> Awaiting fulfilment</span>
              <Badge>{stats.orders.pendingFulfilment}</Badge>
            </Link>
            <Link href="/admin/inventory" className="flex items-center justify-between rounded-md border border-border p-3 text-sm transition-colors hover:bg-accent">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Low stock</span>
              <Badge variant={stats.alerts.lowStockVariants ? 'warning' : 'secondary'}>
                {stats.alerts.lowStockVariants}
              </Badge>
            </Link>
            <div className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
              <span className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Refunds</span>
              <span className="tabular-nums">{stats.refunds.count} · {formatMoney(stats.refunds.amount)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
              <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Avg order value</span>
              <span className="tabular-nums">{formatMoney(stats.revenue.averageOrderValue)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Best sellers</CardTitle>
              <CardDescription>By units sold</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/products">All products <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {bestSellers?.length ? (
              <ul className="space-y-3">
                {bestSellers.map((item, i) => (
                  <li key={item.productId} className="flex items-center gap-3 text-sm">
                    <span className="w-5 shrink-0 text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{item.productName}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">{item.unitsSold} sold</span>
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums">{formatMoney(item.revenue)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No sales in this period yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by category</CardTitle>
            <CardDescription>Where the money comes from</CardDescription>
          </CardHeader>
          <CardContent>
            {byCategory?.length ? (
              <ul className="space-y-3">
                {byCategory.slice(0, 6).map((row) => {
                  const max = Math.max(...byCategory.map((r) => Number(r.revenue)));
                  const pct = max > 0 ? (Number(row.revenue) / max) * 100 : 0;
                  return (
                    <li key={row.categoryId} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span>{row.categoryName}</span>
                        <span className="font-medium tabular-nums">{formatMoney(row.revenue)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No category revenue yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
