import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, hoverable = false, padding = "md", onClick, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="card"
        onClick={onClick}
        className={cn(
          "bg-surface border border-border rounded-2xl shadow-card transition-all duration-200",
          (hoverable || onClick) && "hover:border-border-strong hover:shadow-md cursor-pointer",
          paddingClasses[padding],
          className,
        )}
        {...props}
      />
    );
  },
);

Card.displayName = "Card";

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="card-title" className={cn("text-base font-semibold leading-snug text-ink", className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-description" className={cn("text-sm text-ink-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-footer" className={cn("flex items-center", className)} {...props} />;
}
