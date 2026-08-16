'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreditCard, Lock, ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useQueryClient } from '@tanstack/react-query';
import { useCreatePaymentIntent, useOrder, useVerifyPayment } from '@/hooks/use-orders';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { toast } from 'sonner';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function PaymentInner() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get('orderId') ?? '';
  const email = params.get('email') ?? undefined;

  const { data: order, isLoading } = useOrder(orderId, email);
  const createIntent = useCreatePaymentIntent();
  const verifyPayment = useVerifyPayment();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState(false);
  const [intent, setIntent] = useState<{
    providerOrderId: string;
    publicKey: string;
    amount: string;
    mode?: 'mock' | 'live';
  } | null>(null);

  // Create the gateway order as soon as we know which order we are paying for.
  useEffect(() => {
    if (!orderId || intent || createIntent.isPending) return;
    createIntent.mutate(
      { orderId, email },
      { onSuccess: (data) => setIntent(data) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // The server states which gateway is live. Sniffing the public key for a
  // "mock" substring was wrong: a test key need not contain any marker, so the
  // page rendered the real Razorpay widget while the API was in mock mode.
  const isMock = intent?.mode === 'mock';

  /**
   * Development path: ask the API to sign and verify a mock payment. The
   * endpoint refuses to run unless the mock gateway is configured, so this
   * cannot be used to bypass a real payment.
   */
  const payWithMock = async () => {
    setProcessing(true);
    try {
      const result = await api.post<{ success: boolean; orderId: string }>(
        `/payments/mock/complete${email ? `?email=${encodeURIComponent(email)}` : ''}`,
        { orderId },
      );
      if (result.success) {
        // The cached order still says PENDING; without this the confirmation
        // page renders stale, unpaid data straight after a successful payment.
        await queryClient.invalidateQueries({ queryKey: ['order'] });
        await queryClient.invalidateQueries({ queryKey: ['orders'] });
        await queryClient.invalidateQueries({ queryKey: ['cart'] });
        toast.success('Payment confirmed');
        router.push(`/order-confirmation/${orderId}${email ? `?email=${encodeURIComponent(email)}` : ''}`);
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Payment failed');
      setProcessing(false);
    }
  };

  /** Production path: hand off to the Razorpay checkout widget. */
  const payWithRazorpay = () => {
    if (!intent || !order) return;
    setProcessing(true);

    const launch = () => {
      const rzp = new window.Razorpay!({
        key: intent.publicKey,
        amount: Math.round(Number(order.grandTotal) * 100),
        currency: order.currency,
        name: 'Boutique',
        description: `Order ${order.orderNumber}`,
        order_id: intent.providerOrderId,
        prefill: {
          name: order.shippingAddress?.fullName,
          contact: order.shippingAddress?.phone,
          email: order.user?.email ?? order.guestEmail ?? email,
        },
        theme: { color: '#8b5a3c' },
        handler: async (response: any) => {
          try {
            await verifyPayment.mutateAsync({
              orderId,
              providerOrderId: response.razorpay_order_id,
              providerPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              email,
            });
            router.push(`/order-confirmation/${orderId}${email ? `?email=${encodeURIComponent(email)}` : ''}`);
          } catch {
            setProcessing(false);
          }
        },
        modal: { ondismiss: () => setProcessing(false) },
      });
      rzp.open();
    };

    if (window.Razorpay) {
      launch();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = launch;
    script.onerror = () => {
      toast.error('Could not load the payment gateway');
      setProcessing(false);
    };
    document.body.appendChild(script);
  };

  if (isLoading || !order) {
    return (
      <div className="container flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (order.paymentStatus === 'CAPTURED') {
    router.replace(`/order-confirmation/${orderId}`);
    return null;
  }

  return (
    <div className="container max-w-2xl py-16">
      <div className="text-center">
        <h1 className="display-heading text-3xl font-semibold">Complete your payment</h1>
        <p className="mt-2 text-muted-foreground">Order {order.orderNumber}</p>
      </div>

      <Card className="mt-8">
        <CardContent className="p-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
            </div>
            {Number(order.discountTotal) > 0 ? (
              <div className="flex justify-between text-success">
                <dt>Discount</dt>
                <dd className="tabular-nums">−{formatMoney(order.discountTotal)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="tabular-nums">{formatMoney(order.taxTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd className="tabular-nums">
                {Number(order.shippingTotal) === 0 ? 'Free' : formatMoney(order.shippingTotal)}
              </dd>
            </div>
            <Separator className="my-3" />
            <div className="flex justify-between text-lg font-semibold">
              <dt>Amount payable</dt>
              <dd className="tabular-nums">{formatMoney(order.grandTotal)}</dd>
            </div>
          </dl>

          <Separator className="my-6" />

          {createIntent.isPending || !intent ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparing secure payment…
            </div>
          ) : isMock ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div className="text-sm">
                  <p className="font-medium">Test gateway active</p>
                  <p className="mt-0.5 text-muted-foreground">
                    No real money moves. The signature is still generated and verified
                    server-side exactly as it is in production.
                  </p>
                </div>
              </div>
              <Button size="lg" className="w-full" onClick={payWithMock} loading={processing}>
                <CreditCard className="h-4 w-4" /> Pay {formatMoney(order.grandTotal)}
              </Button>
            </div>
          ) : (
            <Button size="lg" className="w-full" onClick={payWithRazorpay} loading={processing}>
              <CreditCard className="h-4 w-4" /> Pay {formatMoney(order.grandTotal)} securely
            </Button>
          )}

          <div className="mt-5 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Encrypted
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified server-side
            </span>
            <Badge variant="outline">Razorpay</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<div className="container py-32 text-center text-muted-foreground">Loading…</div>}>
      <PaymentInner />
    </Suspense>
  );
}
