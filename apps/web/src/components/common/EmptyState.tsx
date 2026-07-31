import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@marche/ui";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, icon: Icon = Inbox, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-surface border border-border rounded-2xl">
      <div className="w-12 h-12 rounded-xl bg-surface-subtle flex items-center justify-center text-primary mb-4">
        <Icon className="w-6 h-6" />
      </div>
      <h4 className="text-base font-medium text-ink mb-1">{title}</h4>
      <p className="text-sm text-ink-muted max-w-md mb-6">{description}</p>
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
