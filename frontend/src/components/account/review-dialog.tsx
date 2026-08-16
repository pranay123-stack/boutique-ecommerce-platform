'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreateReview } from '@/hooks/use-reviews';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
}

export function ReviewDialog({ open, onOpenChange, productId, productName }: Props) {
  const createReview = useCreateReview();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) return;
    createReview.mutate(
      { productId, rating, title: title || undefined, comment: comment || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setRating(0); setTitle(''); setComment('');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review {productName}</DialogTitle>
          <DialogDescription>
            Only customers who received the item can review it. Reviews are published after moderation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="rating">Rating <span className="text-destructive">*</span></Label>
            <div id="rating" className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating out of 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  className="rounded p-0.5 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star
                    className={cn(
                      'h-7 w-7 transition-colors',
                      n <= (hover || rating) ? 'fill-primary text-primary' : 'text-muted-foreground/40',
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="review-title">Headline</Label>
            <Input
              id="review-title" maxLength={160} value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sums up your experience" className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="review-comment">Your review</Label>
            <Textarea
              id="review-comment" rows={5} maxLength={2000} value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="How does it fit, feel and wear?" className="mt-1.5"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={createReview.isPending} disabled={rating < 1}>
              Submit review
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
