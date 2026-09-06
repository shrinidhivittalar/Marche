import { forwardRef } from 'react';
import type { HTMLAttributes, MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, hoverable = false, padding = 'md', onClick, onKeyDown, ...props }, ref) => {
    // A div with onClick and nothing else is invisible to keyboard and
    // screen-reader users — role/tabIndex make it a reachable, focusable
    // control, and Enter/Space activate it the way a real <button> would.
    // Every page that already passes onClick here gets this for free.
    return (
      <div
        ref={ref}
        data-slot="card"
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onClick(event as unknown as ReactMouseEvent<HTMLDivElement>);
                }
                onKeyDown?.(event);
              }
            : onKeyDown
        }
        className={cn(
          'bg-surface border border-border rounded-2xl shadow-card transition-all duration-200',
          (hoverable || onClick) && 'hover:border-border-strong hover:shadow-md cursor-pointer',
          onClick && 'outline-none focus-visible:shadow-focus',
          paddingClasses[padding],
          className,
        )}
        {...props}
      />
    );
  },
);

Card.displayName = 'Card';

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="card-header" className={cn('flex flex-col gap-1.5', className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-base font-semibold leading-snug text-ink', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-ink-muted', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-footer" className={cn('flex items-center', className)} {...props} />;
}
