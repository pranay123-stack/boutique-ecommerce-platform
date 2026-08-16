import { cn } from '@/lib/utils';

/** Layout-preserving loading placeholder - avoids cumulative layout shift. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-md bg-muted', className)}
      aria-hidden
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-background/50 to-transparent" />
    </div>
  );
}
