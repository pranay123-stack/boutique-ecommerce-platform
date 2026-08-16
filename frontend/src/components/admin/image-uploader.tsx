'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Upload, X, Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getSessionId, tokenStore } from '@/lib/api';

export interface UploadedImage {
  url: string;
  alt?: string;
  isPrimary?: boolean;
  position?: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/proxy';
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

/**
 * Product image uploader.
 *
 * Posts multipart/form-data straight to the uploads endpoint rather than going
 * through the JSON api client - `fetch` must set the multipart boundary itself,
 * so the Content-Type header is deliberately omitted.
 */
export function ImageUploader({
  images,
  onChange,
}: {
  images: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 10);
    if (!list.length) return;

    setUploading(true);
    try {
      const form = new FormData();
      list.forEach((f) => form.append('files', f));
      form.append('folder', 'products');

      const token = tokenStore.get();
      const res = await fetch(`${API_URL}/admin/uploads/images`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Session-Id': getSessionId(),
        },
        body: form,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message ?? 'Upload failed');

      const uploaded: UploadedImage[] = (json.data ?? []).map((f: { url: string }, i: number) => ({
        url: f.url,
        position: images.length + i,
        isPrimary: images.length === 0 && i === 0,
      }));
      onChange([...images, ...uploaded]);
      toast.success(`${uploaded.length} image${uploaded.length === 1 ? '' : 's'} uploaded`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (index: number) => {
    const next = images.filter((_, i) => i !== index).map((img, i) => ({ ...img, position: i }));
    // Never leave a gallery without a primary image.
    if (next.length && !next.some((i) => i.isPrimary)) next[0].isPrimary = true;
    onChange(next);
  };

  const setPrimary = (index: number) =>
    onChange(images.map((img, i) => ({ ...img, isPrimary: i === index })));

  return (
    <div>
      <Label>Images</Label>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}
        className={cn(
          'mt-1.5 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          dragging ? 'border-primary bg-accent' : 'border-border',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          id="product-images"
          onChange={(e) => e.target.files && void upload(e.target.files)}
        />
        {uploading ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
          </p>
        ) : (
          <>
            <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Drag images here, or{' '}
              <button
                type="button"
                className="font-medium text-primary underline"
                onClick={() => inputRef.current?.click()}
              >
                browse
              </button>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPEG, PNG, WebP, GIF or AVIF · up to 10 files
            </p>
          </>
        )}
      </div>

      {images.length ? (
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {images.map((img, i) => (
            <li key={`${img.url}-${i}`} className="group relative">
              <div className="relative aspect-[4/5] overflow-hidden rounded-md border border-border bg-muted">
                <Image src={img.url} alt={img.alt ?? ''} fill sizes="120px" className="object-cover" />
              </div>
              {img.isPrimary ? (
                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  Primary
                </span>
              ) : null}
              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!img.isPrimary ? (
                  <button
                    type="button"
                    aria-label="Set as primary image"
                    onClick={() => setPrimary(i)}
                    className="rounded bg-background/90 p-1 hover:bg-background"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => remove(i)}
                  className="rounded bg-background/90 p-1 text-destructive hover:bg-background"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
