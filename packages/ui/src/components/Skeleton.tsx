import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

// A placeholder block for content that hasn't loaded yet. Callers size it
// with className (e.g. "h-4 w-32", "aspect-square") to match the shape of
// whatever it's standing in for — this component only owns the pulse and
// the surface it pulses against.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-lg bg-surface-subtle', className)}
      {...props}
    />
  );
}
