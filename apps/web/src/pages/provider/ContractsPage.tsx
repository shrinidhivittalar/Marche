import React, { useState } from 'react';
import { EmptyState } from '../../components/common/EmptyState';
import { ComingSoonOverlay } from '../../components/common/ComingSoonOverlay';

type ContractsTab = 'active' | 'all' | 'diary' | 'direct';

export const ContractsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ContractsTab>('active');

  return (
    <ComingSoonOverlay
      className="min-h-[70vh] max-w-6xl mx-auto"
      description="A dedicated contracts workspace — full contract history, work diary, and direct contracts — will be available here soon."
    >
      <div className="space-y-8">
        {/* Header */}
        <div className="pb-6 border-b border-border">
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Contracts</h1>
          <p className="text-xs text-ink-muted mt-1">
            Manage active work, review your full contract history, and track logged hours.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none border-b border-border pb-3">
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
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-primary text-primary-foreground shadow-xs'
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
              <span className="font-bold text-primary">₹0.00</span>
            </div>

            <EmptyState
              title="There are no active contracts."
              description="Contracts you're actively working on will appear here."
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
    </ComingSoonOverlay>
  );
};
