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
  /**
   * Extra labels treated as already existing for the "can create" check,
   * beyond what's in `options`. For callers whose `options` deliberately
   * excludes some already-taken values (e.g. skills the user already
   * holds, left out of the picker so they can't be re-added) — without
   * this, retyping one of those offers to "create" a duplicate.
   */
  existingLabels?: string[];
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
  existingLabels = [],
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const trimmedQuery = query.trim();
  const filtered = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, trimmedQuery]);

  // Offered only when nothing in the list, nor in existingLabels, already
  // says the same thing — compared case-insensitively, so "photography"
  // does not offer to create a second "Photography".
  const canCreate =
    Boolean(onCreate) &&
    trimmedQuery.length > 0 &&
    !options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase()) &&
    !existingLabels.some((l) => l.toLowerCase() === trimmedQuery.toLowerCase());

  // One combined, keyboard-navigable list: the create action first (when
  // offered), then the filtered options — matching their render order below.
  const navItems = useMemo(
    () => [
      ...(canCreate ? [{ kind: 'create' as const }] : []),
      ...filtered.map((option) => ({ kind: 'option' as const, option })),
    ],
    [canCreate, filtered],
  );

  const commitCreate = () => {
    if (!canCreate) return;
    onCreate?.(trimmedQuery);
    setQuery('');
    setOpen(false);
  };

  const selectOption = (option: ComboboxOption) => {
    onChange(option.value);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery('');
          setActiveIndex(0);
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
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder={searchPlaceholder}
            onKeyDown={(e) => {
              // Arrow keys move a highlight through the create action (if
              // offered) and the filtered options, Enter commits whichever
              // is highlighted — so picking an existing option never needs
              // the mouse either, not just creating a new one.
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, navItems.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const active = navItems[activeIndex];
                if (!active) return;
                if (active.kind === 'create') commitCreate();
                else selectOption(active.option);
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
              onMouseEnter={() => setActiveIndex(0)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-left cursor-pointer text-primary transition-colors',
                activeIndex === 0 ? 'bg-surface-subtle' : 'hover:bg-surface-subtle',
              )}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{createLabel(trimmedQuery)}</span>
            </button>
          )}
          {filtered.length === 0 && !canCreate ? (
            <p className="px-3 py-4 text-center text-xs text-ink-muted">{emptyText}</p>
          ) : (
            filtered.map((opt, i) => {
              const isSelected = opt.value === value;
              const navIndex = canCreate ? i + 1 : i;
              const isActive = navIndex === activeIndex;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => selectOption(opt)}
                  onMouseEnter={() => setActiveIndex(navIndex)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground font-bold'
                      : isActive
                        ? 'bg-surface-subtle text-ink'
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
