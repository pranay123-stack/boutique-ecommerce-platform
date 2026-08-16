'use client';

import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/proxy';

/**
 * Download the GST tax invoice for an order.
 *
 * Fetched rather than linked because the endpoint is authenticated: a plain
 * anchor would send the browser off without the bearer token and land on a
 * 403. The blob is handed to a temporary link so the file saves with the
 * invoice number as its name instead of the order id.
 */
export function InvoiceButton({
  orderId,
  email,
  variant = 'outline',
}: {
  orderId: string;
  email?: string;
  variant?: 'outline' | 'ghost' | 'default';
}) {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ format: 'pdf' });
      if (email) params.set('email', email);

      const token =
        typeof window !== 'undefined'
          ? window.sessionStorage.getItem('boutique.accessToken')
          : null;

      const res = await fetch(`${API_URL}/invoices/order/${orderId}?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? 'The invoice is raised once your order is confirmed.'
            : 'Could not download the invoice. Please try again.',
        );
      }

      const blob = await res.blob();
      const name =
        res.headers
          .get('Content-Disposition')
          ?.match(/filename="?([^"]+)"?/)?.[1] ?? `invoice-${orderId}.pdf`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download the invoice');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button variant={variant} size="sm" onClick={download} disabled={downloading}>
      {downloading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <FileText className="h-4 w-4" aria-hidden />
      )}
      Tax invoice
    </Button>
  );
}
