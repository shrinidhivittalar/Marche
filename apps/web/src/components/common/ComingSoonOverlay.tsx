import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Card } from '@marche/ui';

interface ComingSoonOverlayProps {
  description: string;
  className?: string;
  children: ReactNode;
}

// Same blur-and-lock-card pattern ContractsPage and StatsPage already used,
// pulled out now that it's about to appear in three more places (the
// Contracts tabs on MyWorkPage/ClientDashboard, and ContractDetailPage).
// Wraps real content rather than replacing it, so the layout underneath
// stays visible as a preview instead of collapsing to a blank state.
export function ComingSoonOverlay({ description, className, children }: ComingSoonOverlayProps) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
        <Card className="p-8 max-w-sm text-center space-y-3 shadow-lg">
          <div className="w-12 h-12 mx-auto rounded-xl bg-surface-subtle flex items-center justify-center text-primary">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-ink">Coming Soon</h2>
          <p className="text-xs text-ink-muted leading-relaxed">{description}</p>
        </Card>
      </div>

      <div className="blur-sm select-none pointer-events-none" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
