'use client';

import { useState } from 'react';
import { Star, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminReviews, useModerateReview } from '@/hooks/use-admin';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function ReviewsPage() {
  const [status, setStatus] = useState('PENDING');
  const { data, isLoading } = useAdminReviews(status);
  const moderate = useModerateReview();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Reviews</h1>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : !data?.items.length ? (
        <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">
          No {status.toLowerCase()} reviews.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((review: any) => (
            <Card key={review.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={cn('h-3.5 w-3.5', n <= review.rating ? 'fill-primary text-primary' : 'text-muted-foreground/30')} />
                        ))}
                      </div>
                      <span className="text-sm font-medium">
                        {review.user?.firstName} {review.user?.lastName ?? ''}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">on {review.product?.name}</p>
                    {review.title ? <p className="mt-2 font-medium">{review.title}</p> : null}
                    {review.comment ? <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p> : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={review.status === 'APPROVED' ? 'success' : review.status === 'REJECTED' ? 'destructive' : 'warning'}>
                      {review.status}
                    </Badge>
                    {review.status !== 'APPROVED' ? (
                      <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: review.id, status: 'APPROVED' })}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                    ) : null}
                    {review.status !== 'REJECTED' ? (
                      <Button size="sm" variant="ghost" onClick={() => moderate.mutate({ id: review.id, status: 'REJECTED' })}>
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
