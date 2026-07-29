import { forwardRef, useId, useState } from "react";
import type { ReactNode } from "react";
import { Eye, EyeClosed } from "lucide-react";
import { Input, type InputProps } from "./Input";
import { Label } from "./Label";
import { cn } from "../lib/cn";

export interface TextFieldProps extends InputProps {
  label: string;
  error?: string;
  hint?: string;
  labelAction?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, label, error, hint, labelAction, id, type, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const [revealed, setRevealed] = useState(false);
    const isPassword = type === "password";

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={inputId}>{label}</Label>
          {labelAction}
        </div>
        <div className="relative">
          <Input
            ref={ref}
            id={inputId}
            type={isPassword && revealed ? "text" : type}
            aria-invalid={error ? true : undefined}
            aria-describedby={cn(hintId, errorId) || undefined}
            className={cn(isPassword && "pr-11", className)}
            {...props}
          />
          {isPassword ? (
            <button
              type="button"
              onClick={() => setRevealed((current) => !current)}
              aria-label={revealed ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:shadow-focus"
            >
              {revealed ? <Eye size={18} aria-hidden="true" /> : <EyeClosed size={18} aria-hidden="true" />}
            </button>
          ) : null}
        </div>
        {error ? (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-sm text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

TextField.displayName = "TextField";
