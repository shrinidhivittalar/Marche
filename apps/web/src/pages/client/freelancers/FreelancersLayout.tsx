import React from 'react';
import { Heart, Lock } from 'lucide-react';
import { Card } from '@marche/ui';

interface FreelancersLayoutProps {
  activeItem: string;
  comingSoonDescription?: string;
  children: React.ReactNode;
}

export const FreelancersLayout: React.FC<FreelancersLayoutProps> = ({
  activeItem,
  comingSoonDescription,
  children,
}) => {
  const showLists = activeItem === 'Saved talent';

  return (
    <div className="relative min-h-[70vh] max-w-6xl mx-auto">
      {comingSoonDescription && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
          <Card className="p-8 max-w-sm text-center space-y-3 shadow-lg">
            <div className="w-12 h-12 mx-auto rounded-xl bg-surface-subtle flex items-center justify-center text-primary">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-ink">Coming Soon</h2>
            <p className="text-xs text-ink-muted leading-relaxed">{comingSoonDescription}</p>
          </Card>
        </div>
      )}

      <div
        className={
          comingSoonDescription
            ? showLists
              ? 'grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 blur-sm select-none pointer-events-none'
              : 'grid grid-cols-1 gap-8 blur-sm select-none pointer-events-none'
            : showLists
            ? 'grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8'
            : 'grid grid-cols-1 gap-8'
        }
        aria-hidden={comingSoonDescription ? 'true' : undefined}
      >
        {showLists && (
          <aside className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2 pt-2 border-t border-border">
                <h3 className="text-xs font-bold text-ink uppercase tracking-wide">Your lists</h3>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-bold bg-white border border-border text-ink">
                  <Heart className="w-4 h-4" />
                  Saved talent
                </div>
              </div>
            </div>
          </aside>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
};
