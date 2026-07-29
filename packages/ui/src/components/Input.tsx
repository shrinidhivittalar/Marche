import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-md border border-border bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-muted",
        "transition-colors outline-none focus:border-primary focus-visible:shadow-focus",
        "disabled:pointer-events-none disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus:border-destructive",
        className,
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";
