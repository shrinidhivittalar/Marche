import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-800/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 rounded-xl whitespace-nowrap cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-hover shadow-sm border border-primary",
        secondary: "bg-surface-subtle text-ink hover:bg-border border border-border",
        outline: "bg-surface text-ink hover:bg-bg border border-border shadow-xs",
        ghost: "bg-transparent text-ink-muted hover:bg-surface-subtle hover:text-ink",
        danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm border border-rose-600",
      },
      size: {
        sm: "text-xs px-3 py-1.5 gap-1.5 h-8",
        md: "text-sm px-4 py-2 gap-2 h-10",
        lg: "text-base px-5 py-2.5 gap-2.5 h-12",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant,
      size,
      icon: Icon,
      iconPosition = "left",
      loading = false,
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            {Icon && iconPosition === "left" && <Icon className="w-4 h-4 shrink-0" />}
            {children}
            {Icon && iconPosition === "right" && <Icon className="w-4 h-4 shrink-0" />}
          </>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
