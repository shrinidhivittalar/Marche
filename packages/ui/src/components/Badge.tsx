import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 border font-medium whitespace-nowrap transition-colors text-xs px-2.5 py-1 rounded-full",
  {
    variants: {
      variant: {
        success: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/20",
        info: "bg-emerald-900/10 text-emerald-900 dark:text-emerald-400 border-emerald-900/20 dark:border-emerald-500/20 font-medium",
        warning: "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-200/60 dark:border-amber-500/20",
        destructive: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200/60 dark:border-rose-500/20",
        neutral: "bg-surface-subtle text-ink border-border",
        default: "bg-inverse text-inverse-fg border-transparent",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

const dotColors: Record<string, string> = {
  success: "bg-emerald-600",
  info: "bg-emerald-600",
  warning: "bg-amber-500",
  destructive: "bg-rose-500",
  neutral: "bg-zinc-400",
  default: "bg-zinc-400",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Renders a small status dot before the label, colored to match the variant. */
  dot?: boolean;
}

export function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  const resolvedVariant = variant ?? "neutral";
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? <span className={cn("w-1.5 h-1.5 rounded-full", dotColors[resolvedVariant])} /> : null}
      {children}
    </span>
  );
}
