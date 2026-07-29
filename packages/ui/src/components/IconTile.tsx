import type { ReactNode } from "react";
import { cn } from "../lib/cn";

type IconTileTone = "primary" | "accent" | "success" | "ink";

export interface IconTileProps {
  icon: ReactNode;
  tone?: IconTileTone;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const toneClasses: Record<IconTileTone, string> = {
  primary: "bg-primary-subtle text-primary",
  accent: "bg-accent-subtle text-accent-text",
  success: "bg-success-subtle text-success-text",
  ink: "bg-surface-subtle text-ink",
};

const sizeClasses = {
  sm: "size-10 rounded-md",
  md: "size-12 rounded-md",
  lg: "size-14 rounded-lg",
};

export function IconTile({ icon, tone = "primary", size = "md", className }: IconTileProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center", toneClasses[tone], sizeClasses[size], className)}
    >
      {icon}
    </div>
  );
}
