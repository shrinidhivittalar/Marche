import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./Popover";
import { cn } from "../lib/cn";

export interface MonthPickerProps {
  value?: string; // "YYYY-MM"
  onChange: (value: string) => void;
  min?: string; // "YYYY-MM"
  max?: string; // "YYYY-MM"
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(value?: string): { year: number; month: number } | null {
  if (!value) return null;
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return null;
  return { year: y, month: m - 1 };
}

function format(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function MonthPicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Select month",
  className,
  disabled,
  "aria-invalid": ariaInvalid,
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parse(value);
  const minParsed = parse(min);
  const maxParsed = parse(max);
  const [viewYear, setViewYear] = useState(selected?.year ?? new Date().getFullYear());

  const isDisabled = (year: number, monthIndex: number) => {
    const key = year * 12 + monthIndex;
    if (minParsed && key < minParsed.year * 12 + minParsed.month) return true;
    if (maxParsed && key > maxParsed.year * 12 + maxParsed.month) return true;
    return false;
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setViewYear(selected?.year ?? new Date().getFullYear());
      }}
    >
      <PopoverTrigger
        type="button"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        className={cn(
          "flex items-center gap-2 bg-bg border border-border rounded-xl px-3 py-2.5 text-xs text-left transition-colors",
          "focus:outline-none focus:border-primary",
          "disabled:opacity-50 disabled:pointer-events-none",
          "aria-invalid:border-destructive",
          selected ? "text-ink" : "text-ink-muted",
          className,
        )}
      >
        <CalendarDays className="w-3.5 h-3.5 text-ink-muted shrink-0" />
        {selected ? `${MONTHS[selected.month]} ${selected.year}` : placeholder}
      </PopoverTrigger>
      <PopoverContent align="start" className="p-3 w-64">
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-ink select-none">{viewYear}</span>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((label, idx) => {
            const isSelected = selected?.year === viewYear && selected?.month === idx;
            const disabledCell = isDisabled(viewYear, idx);
            return (
              <button
                key={label}
                type="button"
                disabled={disabledCell}
                onClick={() => {
                  onChange(format(viewYear, idx));
                  setOpen(false);
                }}
                className={cn(
                  "py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors",
                  disabledCell
                    ? "text-ink-muted/30 cursor-not-allowed"
                    : isSelected
                    ? "bg-primary text-primary-foreground font-bold"
                    : "text-ink hover:bg-surface-subtle",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
