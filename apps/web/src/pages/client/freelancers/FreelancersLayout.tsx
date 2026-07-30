import React from 'react';
import { Asterisk, Briefcase, Building2, RotateCcw, History, Heart, Bookmark, Plus, Lock } from 'lucide-react';
import { Card } from '@marche/ui';

const SUBNAV = [
  { label: 'Discover', icon: Asterisk },
  { label: 'Your hires', icon: Briefcase },
  { label: 'Company hires', icon: Building2 },
  { label: 'Direct contracts', icon: RotateCcw },
  { label: 'Recently viewed', icon: History },
];

interface FreelancersLayoutProps {
  activeItem: string;
  comingSoonDescription: string;
  children: React.ReactNode;
}

export const FreelancersLayout: React.FC<FreelancersLayoutProps> = ({
  activeItem,
  comingSoonDescription,
  children,
}) => {
  return (
    <div className="relative min-h-[70vh] max-w-6xl mx-auto">
      {/* Coming Soon overlay */}
      <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
        <Card className="p-8 max-w-sm text-center space-y-3 shadow-lg">
          <div className="w-12 h-12 mx-auto rounded-xl bg-surface-subtle flex items-center justify-center text-primary">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-ink">Coming Soon</h2>
          <p className="text-xs text-ink-muted leading-relaxed">{comingSoonDescription}</p>
        </Card>
      </div>

      {/* Blurred preview of the finished screen */}
      <div
        className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 blur-sm select-none pointer-events-none"
        aria-hidden="true"
      >
        <aside className="space-y-6">
          <nav className="space-y-1">
            {SUBNAV.map(({ label, icon: Icon }) => (
              <div
                key={label}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium ${
                  label === activeItem ? 'bg-white border border-border text-ink font-bold' : 'text-ink-muted'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </div>
            ))}
          </nav>

          <div>
            <div className="flex items-center justify-between mb-2 pt-2 border-t border-border">
              <h3 className="text-xs font-bold text-ink uppercase tracking-wide">Your lists</h3>
              <Plus className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 px-2.5 py-2 text-xs text-ink-muted">
                <Heart className="w-4 h-4" />
                Saved talent
              </div>
              <div className="flex items-center gap-2.5 px-2.5 py-2 text-xs text-ink-muted">
                <Bookmark className="w-4 h-4" />
                Saved projects
              </div>
            </div>
          </div>
        </aside>

        <div>{children}</div>
      </div>
    </div>
  );
};
