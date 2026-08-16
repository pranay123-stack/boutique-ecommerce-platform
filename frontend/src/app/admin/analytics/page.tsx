'use client';

import { useMemo, useState } from 'react';
import { Download, TrendingUp } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBestSellers, useDashboard, useRevenueByCategory, useSalesSeries,
} from '@/hooks/use-admin';
import { api } from '@/lib/api';
import { formatMoney, formatNumber, humanizeStatus } from '@/lib/format';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function AnalyticsPage() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [exporting, setExporting] = useState(false);

  const { data: stats, isLoading } = useDashboard(from, to);
  const { data: series } = useSalesSeries(from, to);
  const { data: bestSellers } = useBestSellers(10);
  const { data: byCategory } = useRevenueByCategory();

  const orderStatus = useMemo(() => stats?.orders, [stats]);

  /**
   * Build the CSV in the browser from the flat rows the API returns.
   * The sandboxed artifact/CDN environments block script-initiated downloads,
   * so this is a normal same-origin blob link created on click.
   */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await api.get<Array<Record<string, string | number>>>(
        `/admin/analytics/reports/sales?from=${from}&to=${to}`,
      );
      if (!rows.length) {
        toast.error('No orders in that range');
        return;
      }
      const headers = Object.keys(rows[0]);
      const escape = (v: unknown) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `boutique-sales-${from}-to-${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} orders`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Analytics &amp; reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Revenue counts captured payments only, net of refunds</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="from" className="text-xs">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 w-40" />
          </div>
          <div>
            <Label htmlFor="to" className="text-xs">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 w-40" />
          </div>
          <Button onClick={exportCsv} loading={exporting}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {isLoading || !stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Net revenue', formatMoney(stats.revenue.net), `${formatMoney(stats.revenue.gross)} gross`],
              ['Refunded', formatMoney(stats.revenue.refunded), `${stats.refunds.count} refunds`],
              ['Tax collected', formatMoney(stats.revenue.tax), `${formatMoney(stats.revenue.shipping)} shipping`],
              ['Discounts given', formatMoney(stats.revenue.discounts), `AOV ${formatMoney(stats.revenue.averageOrderValue)}`],
            ].map(([label, value, sub]) => (
              <Card key={label}>
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" /> Orders per day
              </CardTitle>
              <CardDescription>
                {formatNumber(orderStatus?.paid ?? 0)} paid of {formatNumber(orderStatus?.total ?? 0)} placed
                {' · '}{orderStatus?.conversionRate ?? 0}% conversion
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series ?? []} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={24}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} width={40}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [v, 'Orders']}
                    />
                    <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Best sellers</CardTitle>
                <CardDescription>By units sold in the selected range</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {bestSellers?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bestSellers.map((row) => (
                        <TableRow key={row.productId}>
                          <TableCell className="max-w-64 truncate text-sm">{row.productName}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.unitsSold}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatMoney(row.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="p-8 text-center text-sm text-muted-foreground">No sales in this range.</p>
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
                    {byCategory.slice(0, 8).map((row) => {
                      const max = Math.max(...byCategory.map((r) => Number(r.revenue)));
                      const pct = max > 0 ? (Number(row.revenue) / max) * 100 : 0;
                      return (
                        <li key={row.categoryId} className="text-sm">
                          <div className="flex items-center justify-between">
                            <span>{row.categoryName}</span>
                            <span className="tabular-nums">
                              <Badge variant="outline" className="mr-2">{row.units} units</Badge>
                              <span className="font-medium">{formatMoney(row.revenue)}</span>
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No category revenue yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
