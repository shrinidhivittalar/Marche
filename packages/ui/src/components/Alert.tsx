import type { HTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '../lib/cn';

// Boxed info/success/warning/error status message — distinct from Badge
// (an inline status chip). Same four semantic variants as Badge so a given
// color always means the same thing across both.
const alertVariants = cva('flex items-start gap-3 rounded-xl border p-4', {
  variants: {
    variant: {
      info: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200/60 dark:border-blue-500/20 text-blue-900 dark:text-blue-300',
      success:
        'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20 text-emerald-900 dark:text-emerald-300',
      warning:
        'bg-amber-50 dark:bg-amber-500/10 border-amber-200/60 dark:border-amber-500/20 text-amber-900 dark:text-amber-300',
      destructive:
        'bg-rose-50 dark:bg-rose-500/10 border-rose-200/60 dark:border-rose-500/20 text-rose-900 dark:text-rose-300',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
} as const;

const ICON_COLORS: Record<keyof typeof ICONS, string> = {
  info: 'text-blue-600 dark:text-blue-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  destructive: 'text-rose-600 dark:text-rose-400',
};

export interface AlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof alertVariants> {
  /** Bold lead line. Omit for a plain single-line message via `children`. */
  title?: ReactNode;
}

export function Alert({ className, variant, title, children, ...props }: AlertProps) {
  const resolved = variant ?? 'info';
  const Icon = ICONS[resolved];
  return (
    <div
      data-slot="alert"
      role="status"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', ICON_COLORS[resolved])} />
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="text-sm font-semibold leading-snug">{title}</p> : null}
        {children ? <div className="text-xs leading-relaxed opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
