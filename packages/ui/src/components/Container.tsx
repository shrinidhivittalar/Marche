import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1216px] px-5 sm:px-8 lg:px-10", className)}
      {...props}
    />
  );
}
