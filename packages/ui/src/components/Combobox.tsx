import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';
import { cn } from '../lib/cn';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'data-testid'?: string;
  /**
   * Lets the user commit whatever they typed, when it matches nothing in the
   * list. Omit it and the combobox stays a strict picker.
   *
   * The list is still offered first and matching is case-insensitive, so a
   * value that already exists is chosen rather than typed again — which is
   * what keeps a creatable field from filling up with near-duplicates.
   */
  onCreate?: (label: string) => void;
  createLabel?: (label: string) => string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  className,
  disabled,
  'aria-invalid': ariaInvalid,
  'data-testid': testId,
  onCreate,
  createLabel = (label) => `Add "${label}"`,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const trimmedQuery = query.trim();
  const filtered = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, trimmedQuery]);

  // Offered only when nothing in the list already says the same thing —
  // compared case-insensitively, so "photography" does not offer to create a
  // second "Photography".
  const canCreate =
    Boolean(onCreate) &&
    trimmedQuery.length > 0 &&
    !options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());

  const commitCreate = () => {
    if (!canCreate) return;
    onCreate?.(trimmedQuery);
    setQuery('');
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery('');
          requestAnimationFrame(() => searchRef.current?.focus());
        }
      }}
    >
      <PopoverTrigger
        type="button"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        data-testid={testId}
        className={cn(
          'h-12 w-full flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3.5 text-[15px] text-left transition-colors',
          'outline-none focus:border-primary focus-visible:shadow-focus',
          'disabled:pointer-events-none disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:focus:border-destructive',
          selected ? 'text-ink' : 'text-ink-muted',
          className,
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="w-4 h-4 text-ink-muted shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-72 max-w-[90vw]">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="w-3.5 h-3.5 text-ink-muted shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            onKeyDown={(e) => {
              // Enter commits a new value, so the common case never needs
              // the mouse.
              if (e.key === 'Enter' && canCreate) {
                e.preventDefault();
                commitCreate();
              }
            }}
            className="flex-1 bg-transparent text-xs text-ink placeholder:text-ink-muted outline-none"
          />
        </div>
        <div
          className="h-64 overflow-y-auto p-1.5"
          data-testid={testId ? `${testId}-options` : undefined}
        >
          {canCreate && (
            <button
              type="button"
              onClick={commitCreate}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-left cursor-pointer text-primary hover:bg-surface-subtle transition-colors"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{createLabel(trimmedQuery)}</span>
            </button>
          )}
          {filtered.length === 0 && !canCreate ? (
            <p className="px-3 py-4 text-center text-xs text-ink-muted">{emptyText}</p>
          ) : (
            filtered.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground font-bold'
                      : 'text-ink hover:bg-surface-subtle',
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
