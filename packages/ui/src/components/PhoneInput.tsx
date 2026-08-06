import { useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./Popover";
import { COUNTRY_CODES } from "../data/countryCodes";
import { cn } from "../lib/cn";

export interface PhoneInputProps {
  value?: string; // e.g. "+91 9876543210"
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}

const DEFAULT_DIAL_CODE = "+91";

function splitValue(value: string | undefined): { dialCode: string; number: string } {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { dialCode: DEFAULT_DIAL_CODE, number: "" };

  const match = COUNTRY_CODES.filter((c) => trimmed.startsWith(c.dialCode)).sort(
    (a, b) => b.dialCode.length - a.dialCode.length,
  )[0];

  if (!match) return { dialCode: DEFAULT_DIAL_CODE, number: trimmed };
  return { dialCode: match.dialCode, number: trimmed.slice(match.dialCode.length).trim() };
}

export function PhoneInput({
  value,
  onChange,
  placeholder = "Enter number",
  className,
  disabled,
  "aria-invalid": ariaInvalid,
}: PhoneInputProps) {
  const { dialCode, number } = splitValue(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedCountry = COUNTRY_CODES.find((c) => c.dialCode === dialCode) ?? COUNTRY_CODES.find((c) => c.iso2 === "IN")!;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_CODES;
    return COUNTRY_CODES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dialCode.includes(q),
    );
  }, [query]);

  const emit = (nextDialCode: string, nextNumber: string) => {
    onChange(nextNumber ? `${nextDialCode} ${nextNumber}` : nextDialCode);
  };

  return (
    <div
      className={cn(
        "flex items-stretch rounded-md border border-border bg-surface overflow-hidden transition-colors",
        "focus-within:border-primary focus-within:shadow-focus",
        "aria-invalid:border-destructive",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      aria-invalid={ariaInvalid}
    >
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
          className="flex items-center gap-1 pl-3.5 pr-2.5 border-r border-border text-[15px] text-ink shrink-0 outline-none hover:bg-surface-subtle transition-colors"
        >
          <span>{selectedCountry.flag}</span>
          <span className="font-medium">{selectedCountry.dialCode}</span>
          <ChevronDown className="w-3.5 h-3.5 text-ink-muted" />
        </PopoverTrigger>
        <PopoverContent align="start" className="p-0 w-72 max-w-[90vw]">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Search className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country..."
              className="flex-1 bg-transparent text-xs text-ink placeholder:text-ink-muted outline-none"
            />
          </div>
          <div className="h-64 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-ink-muted">No countries found.</p>
            ) : (
              filtered.map((country) => {
                const isSelected = country.dialCode === dialCode;
                return (
                  <button
                    key={country.iso2}
                    type="button"
                    onClick={() => {
                      emit(country.dialCode, number);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors",
                      isSelected ? "bg-primary text-primary-foreground font-bold" : "text-ink hover:bg-surface-subtle",
                    )}
                  >
                    <span>{country.flag}</span>
                    <span className="flex-1 truncate">{country.name}</span>
                    <span className={isSelected ? "text-white/80" : "text-ink-muted"}>{country.dialCode}</span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      <input
        type="tel"
        value={number}
        onChange={(e) => emit(dialCode, e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 min-w-0 h-12 bg-transparent px-3.5 text-[15px] text-ink placeholder:text-ink-muted outline-none"
      />
    </div>
  );
}
