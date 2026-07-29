import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 rounded-md border border-border bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-muted",
        "transition-colors outline-none focus:border-primary focus-visible:shadow-focus",
        "disabled:pointer-events-none disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus:border-destructive",
        className,
      )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";
