import { Avatar as AvatarPrimitive } from "radix-ui";
import { cn } from "../lib/cn";

export interface AvatarProps {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "size-10 text-sm",
  md: "size-12 text-base",
  lg: "size-16 text-lg",
};

const palette = [
  "bg-primary-subtle text-primary",
  "bg-accent-subtle text-accent-foreground",
  "bg-success-subtle text-success-text",
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function paletteIndexOf(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % palette.length;
  return hash;
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn("flex shrink-0 items-center justify-center rounded-full ring-1 ring-border", sizeClasses[size], className)}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={name} className="size-full rounded-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        delayMs={src ? 300 : undefined}
        className={cn("flex size-full items-center justify-center rounded-full font-semibold", palette[paletteIndexOf(name)])}
      >
        {initialsOf(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
