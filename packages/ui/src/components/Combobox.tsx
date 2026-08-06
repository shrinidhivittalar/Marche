import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./Popover";
import { cn } from "../lib/cn";

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
  "aria-invalid"?: boolean;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
  disabled,
  "aria-invalid": ariaInvalid,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          requestAnimationFrame(() => searchRef.current?.focus());
        }
      }}
    >
      <PopoverTrigger
        type="button"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        className={cn(
          "h-12 w-full flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3.5 text-[15px] text-left transition-colors",
          "outline-none focus:border-primary focus-visible:shadow-focus",
          "disabled:pointer-events-none disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:focus:border-destructive",
          selected ? "text-ink" : "text-ink-muted",
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
            className="flex-1 bg-transparent text-xs text-ink placeholder:text-ink-muted outline-none"
          />
        </div>
        <div className="h-64 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
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
                    "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors",
                    isSelected ? "bg-primary text-primary-foreground font-bold" : "text-ink hover:bg-surface-subtle",
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
