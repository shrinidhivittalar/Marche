import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

export function SheetOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200",
        className,
      )}
      {...props}
    />
  );
}

export interface SheetContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  side?: "right" | "left";
  showClose?: boolean;
  title: string;
  description?: string;
}

export function SheetContent({
  className,
  children,
  side = "right",
  showClose = true,
  title,
  description,
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 z-50 h-full w-full sm:max-w-2xl bg-surface shadow-card-hover flex flex-col focus:outline-none overflow-y-auto p-6 lg:p-10",
          side === "right"
            ? "right-0 border-l border-border animate-in slide-in-from-right duration-300"
            : "left-0 border-r border-border animate-in slide-in-from-left duration-300",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
        ) : null}
        {showClose ? (
          <DialogPrimitive.Close
            data-slot="sheet-close"
            className="absolute right-4 top-4 z-10 p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </DialogPrimitive.Close>
        ) : null}
        {children}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}
