import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { Card } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';

type ContractsTab = 'active' | 'all' | 'diary' | 'direct';

export const ContractsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ContractsTab>('active');

  return (
    <div className="relative min-h-[70vh] max-w-6xl mx-auto">
      {/* Coming Soon overlay */}
      <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
        <Card className="p-8 max-w-sm text-center space-y-3 shadow-lg">
          <div className="w-12 h-12 mx-auto rounded-xl bg-surface-subtle flex items-center justify-center text-primary">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-ink">Coming Soon</h2>
          <p className="text-xs text-ink-muted leading-relaxed">
            A dedicated contracts workspace — full contract history, work diary, and direct contracts —
            will be available here soon.
          </p>
        </Card>
      </div>

      {/* Blurred preview of the finished Contracts screen */}
      <div className="space-y-8 blur-sm select-none pointer-events-none" aria-hidden="true">
        {/* Header */}
        <div className="pb-6 border-b border-border">
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Contracts</h1>
          <p className="text-xs text-ink-muted mt-1">
            Manage active work, review your full contract history, and track logged hours.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-border pb-3">
          {(
            [
              ['active', 'Active Contracts'],
              ['all', 'All Contracts'],
              ['diary', 'Work Diary'],
              ['direct', 'Direct Contracts'],
            ] as [ContractsTab, string][]
          ).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeTab === tab
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-white text-ink-muted hover:text-ink border border-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* TAB 1: Active Contracts */}
        {activeTab === 'active' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-muted">Earnings available now:</span>
              <span className="font-bold text-primary">$0.00</span>
            </div>

            <EmptyState
              title="There are no active contracts."
              description="Contracts you're actively working on will appear here."
              actionLabel="Search for new projects"
              onAction={() => {}}
            />
          </div>
        )}

        {/* TAB 2: All Contracts */}
        {activeTab === 'all' && (
          <EmptyState
            title="No contract history yet"
            description="Completed and cancelled contracts will show up here."
          />
        )}

        {/* TAB 3: Work Diary */}
        {activeTab === 'diary' && (
          <EmptyState
            title="No work diary entries"
            description="Hourly contracts will automatically log your work here."
          />
        )}

        {/* TAB 4: Direct Contracts */}
        {activeTab === 'direct' && (
          <EmptyState
            title="No direct contracts"
            description="Contracts you create directly with clients outside the marketplace will appear here."
          />
        )}
      </div>
    </div>
  );
};
