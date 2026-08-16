'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import Image from 'next/image';
import { Trash2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';

export default function ContentPage() {
  const qc = useQueryClient();
  const { data: banners, isLoading } = useQuery({
    queryKey: ['admin', 'banners'],
    queryFn: () => api.get<any[]>('/admin/content/banners'),
  });

  const deleteBanner = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/content/banners/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'banners'] });
      toast.success('Banner removed');
    },
    onError: (error: ApiError) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Content</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Homepage banners</CardTitle>
          <CardDescription>Hero and promotional slots on the storefront</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40" />)}</div>
          ) : !banners?.length ? (
            <div className="flex flex-col items-center py-12 text-center">
              <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">No banners configured.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {banners.map((banner) => (
                <div key={banner.id} className="overflow-hidden rounded-lg border border-border">
                  <div className="relative aspect-[16/9] bg-muted">
                    {banner.imageUrl ? (
                      <Image src={banner.imageUrl} alt={banner.title} fill sizes="50vw" className="object-cover" />
                    ) : null}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{banner.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{banner.subtitle}</p>
                      </div>
                      <Button variant="ghost" size="icon" aria-label="Delete banner"
                        onClick={() => { if (confirm(`Delete "${banner.title}"?`)) deleteBanner.mutate(banner.id); }}>
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Badge variant="outline">{banner.placement}</Badge>
                      <Badge variant={banner.isActive ? 'success' : 'secondary'}>
                        {banner.isActive ? 'Live' : 'Hidden'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
