import { useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./Popover";
import { cn } from "../lib/cn";

export interface TimePickerProps {
  value?: string; // 24-hour "HH:MM"
  onChange: (value: string) => void;
  step?: number; // minutes between options, default 30
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}

function formatTimeLabel(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function buildOptions(step: number): string[] {
  const options: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += step) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    options.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return options;
}

export function TimePicker({
  value,
  onChange,
  step = 30,
  placeholder = "Select time",
  className,
  disabled,
  "aria-invalid": ariaInvalid,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => buildOptions(step), [step]);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToSelected = () => {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector('[data-selected="true"]');
      el?.scrollIntoView({ block: "center" });
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) scrollToSelected();
      }}
    >
      <PopoverTrigger
        type="button"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        className={cn(
          "h-12 w-full flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 text-[15px] text-left transition-colors",
          "outline-none focus:border-primary focus-visible:shadow-focus",
          "disabled:pointer-events-none disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:focus:border-destructive",
          value ? "text-ink" : "text-ink-muted",
          className,
        )}
      >
        <Clock className="w-4 h-4 text-ink-muted shrink-0" />
        {value ? formatTimeLabel(value) : placeholder}
      </PopoverTrigger>
      <PopoverContent align="start" className="p-1.5 w-40">
        <div ref={listRef} className="max-h-56 overflow-y-auto space-y-0.5">
          {options.map((opt) => {
            const isSelected = opt === value;
            return (
              <button
                key={opt}
                type="button"
                data-selected={isSelected}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors",
                  isSelected ? "bg-primary text-primary-foreground font-bold" : "text-ink hover:bg-surface-subtle",
                )}
              >
                {formatTimeLabel(opt)}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
