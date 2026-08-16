'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Star, MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyReviews } from '@/hooks/use-reviews';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  APPROVED: { label: 'Published', variant: 'success' },
  PENDING: { label: 'Awaiting moderation', variant: 'warning' },
  REJECTED: { label: 'Not published', variant: 'destructive' },
};

export default function MyReviewsPage() {
  const { data, isLoading } = useMyReviews();

  if (isLoading) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>;
  }

  if (!data?.items.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/30" />
          <h2 className="mt-4 font-medium">No reviews yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Once an order is delivered you can review the pieces from your order details.
          </p>
          <Button asChild className="mt-6"><Link href="/account/orders">View my orders</Link></Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">
        {data.items.length} review{data.items.length === 1 ? '' : 's'}
      </h2>

      {data.items.map((review) => {
        const status = STATUS[review.status] ?? STATUS.PENDING;
        const image = review.product?.images?.[0]?.url;
        return (
          <Card key={review.id}>
            <CardContent className="flex gap-4 p-5">
              <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded bg-muted">
                {image ? <Image src={image} alt="" fill sizes="64px" className="object-cover" /> : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    href={`/products/${review.product?.slug}`}
                    className="font-medium hover:underline"
                  >
                    {review.product?.name}
                  </Link>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex" aria-label={`Rated ${review.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={cn('h-3.5 w-3.5', n <= review.rating ? 'fill-primary text-primary' : 'text-muted-foreground/30')}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                </div>

                {review.title ? <p className="mt-2 text-sm font-medium">{review.title}</p> : null}
                {review.comment ? (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{review.comment}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
