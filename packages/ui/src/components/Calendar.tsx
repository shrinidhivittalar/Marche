import type { ComponentProps } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { cn } from "../lib/cn";

export type CalendarProps = ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, captionLayout = "label", ...props }: CalendarProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn("p-3", className)}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("flex flex-col gap-4", defaultClassNames.months),
        month: cn("flex flex-col w-full gap-3", defaultClassNames.month),
        nav: cn("flex items-center justify-between absolute inset-x-1 top-1", defaultClassNames.nav),
        button_previous: cn(
          "h-7 w-7 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-subtle transition-colors disabled:opacity-30 cursor-pointer",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          "h-7 w-7 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-subtle transition-colors disabled:opacity-30 cursor-pointer",
          defaultClassNames.button_next,
        ),
        month_caption: cn("flex items-center justify-center h-7 mb-1", defaultClassNames.month_caption),
        caption_label: cn(
          "font-bold text-ink select-none",
          captionLayout === "label"
            ? "text-sm"
            : "flex items-center gap-1 pl-2.5 pr-1.5 h-7 text-xs rounded-lg hover:bg-surface-subtle [&>svg]:text-ink-muted [&>svg]:w-3.5 [&>svg]:h-3.5",
          defaultClassNames.caption_label,
        ),
        dropdowns: cn("flex items-center justify-center gap-1.5", defaultClassNames.dropdowns),
        dropdown_root: cn(
          "relative rounded-lg border border-border has-focus:border-primary transition-colors",
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn("absolute inset-0 opacity-0 cursor-pointer", defaultClassNames.dropdown),
        months_dropdown: cn(defaultClassNames.months_dropdown),
        years_dropdown: cn(defaultClassNames.years_dropdown),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-ink-muted flex-1 font-semibold text-[10px] uppercase tracking-wide select-none pb-1",
          defaultClassNames.weekday,
        ),
        week: cn("flex w-full mt-1", defaultClassNames.week),
        day: cn("relative flex-1 p-0.5 text-center group/day select-none", defaultClassNames.day),
        day_button: cn(
          "w-9 h-9 flex items-center justify-center rounded-full text-xs font-medium text-ink mx-auto cursor-pointer transition-colors",
          "hover:bg-surface-subtle",
          "group-data-[selected=true]/day:bg-primary group-data-[selected=true]/day:text-primary-foreground group-data-[selected=true]/day:font-bold group-data-[selected=true]/day:hover:bg-primary-hover",
          defaultClassNames.day_button,
        ),
        today: cn("[&_button]:border [&_button]:border-primary [&_button]:font-bold", defaultClassNames.today),
        outside: cn("text-ink-muted/50", defaultClassNames.outside),
        disabled: cn("text-ink-muted/30 [&_button]:cursor-not-allowed [&_button]:hover:bg-transparent", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevronClassName, orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("w-4 h-4", chevronClassName)} />
          ) : (
            <ChevronRight className={cn("w-4 h-4", chevronClassName)} />
          ),
      }}
      {...props}
    />
  );
}
