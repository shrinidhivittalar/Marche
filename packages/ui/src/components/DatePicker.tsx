import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';
import { Calendar } from './Calendar';
import { cn } from '../lib/cn';

export interface DatePickerProps {
  value?: string; // ISO date string, YYYY-MM-DD
  onChange: (value: string) => void;
  min?: string; // ISO date string
  max?: string; // ISO date string
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'data-testid'?: string;
  /** Use "dropdown" to add month/year select dropdowns — handy for far-back dates like a date of birth. */
  captionLayout?: 'label' | 'dropdown' | 'dropdown-months' | 'dropdown-years';
}

function parseISODate(value?: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Select date',
  className,
  disabled,
  'aria-invalid': ariaInvalid,
  'data-testid': testId,
  captionLayout = 'label',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const minDate = parseISODate(min);
  const maxDate = parseISODate(max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        data-testid={testId}
        className={cn(
          'h-12 w-full flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 text-[15px] text-left transition-colors',
          'outline-none focus:border-primary focus-visible:shadow-focus',
          'disabled:pointer-events-none disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:focus:border-destructive',
          selected ? 'text-ink' : 'text-ink-muted',
          className,
        )}
      >
        <CalendarDays className="w-4 h-4 text-ink-muted shrink-0" />
        {selected
          ? selected.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : placeholder}
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0">
        <Calendar
          mode="single"
          captionLayout={captionLayout}
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(toISODate(date));
              setOpen(false);
            }
          }}
          disabled={(date) => (minDate && date < minDate) || (maxDate && date > maxDate) || false}
          defaultMonth={selected ?? minDate}
        />
      </PopoverContent>
    </Popover>
  );
}
