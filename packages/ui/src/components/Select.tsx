import type { ComponentProps } from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        'h-12 w-full flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3.5 text-[15px] text-ink transition-colors',
        'outline-none focus:border-primary focus-visible:shadow-focus data-[placeholder]:text-ink-muted',
        'disabled:pointer-events-none disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:focus:border-destructive',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="w-4 h-4 text-ink-muted shrink-0" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export interface SelectContentProps extends ComponentProps<typeof SelectPrimitive.Content> {
  /** Same reasoning as DialogContent's own `container` prop — keeps the
   * portaled dropdown inside a scoped [data-theme] wrapper instead of
   * escaping to document.body. Undefined keeps Radix's own default. */
  container?: HTMLElement | null;
}

export function SelectContent({
  className,
  children,
  position = 'popper',
  container,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        className={cn(
          'z-50 min-w-[var(--radix-select-trigger-width)] bg-surface border border-border rounded-2xl shadow-card-hover overflow-hidden animate-in fade-in zoom-in-95 duration-150 focus:outline-none',
          position === 'popper' && 'translate-y-1',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-ink cursor-pointer select-none outline-none',
        'data-[highlighted]:bg-surface-subtle data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:font-bold',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ml-auto">
        <Check className="w-3.5 h-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
