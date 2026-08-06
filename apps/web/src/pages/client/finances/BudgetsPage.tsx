import React from 'react';
import { FileSearch, IndianRupee, Layers3 } from 'lucide-react';
import { Card } from '@marche/ui';
import { EmptyState } from '../../../components/common/EmptyState';
import { useApp } from '../../../context/AppContext';
import { formatMoney, getBudgetSummaries } from '../../../lib/finance';

export const BudgetsPage: React.FC = () => {
  const { currentUser, jobs, contracts } = useApp();
  const budgets = getBudgetSummaries(jobs, contracts, currentUser.id);
  const planned = budgets.reduce((total, budget) => total + budget.planned, 0);
  const committed = budgets.reduce((total, budget) => total + budget.committed, 0);
  const remaining = planned - committed;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Budgets</h1>
        <p className="text-xs text-ink-muted mt-1">
          Budget usage is calculated from your posted jobs and confirmed contracts.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <span className="text-xs font-medium text-ink-muted">Planned budget</span>
          <p className="text-2xl font-bold text-ink mt-2">{formatMoney(planned)}</p>
        </Card>
        <Card className="p-5">
          <span className="text-xs font-medium text-ink-muted">Committed</span>
          <p className="text-2xl font-bold text-ink mt-2">{formatMoney(committed)}</p>
        </Card>
        <Card className="p-5">
          <span className="text-xs font-medium text-ink-muted">Remaining</span>
          <p className="text-2xl font-bold text-ink mt-2">{formatMoney(remaining)}</p>
        </Card>
      </div>

      {budgets.length === 0 ? (
        <EmptyState
          title="No budgets yet"
          description="Post jobs to create category budget summaries. Contracted amounts will be tracked against them."
          icon={FileSearch}
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="divide-y divide-border">
            {budgets.map((budget) => {
              const progress = budget.planned > 0 ? Math.min(100, Math.round((budget.committed / budget.planned) * 100)) : 0;

              return (
                <div key={budget.category} className="p-4 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-primary-subtle text-primary flex items-center justify-center shrink-0">
                        <Layers3 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-ink truncate">{budget.category}</h2>
                        <p className="text-xs text-ink-muted">
                          {budget.jobsCount} job{budget.jobsCount === 1 ? '' : 's'} - {budget.contractsCount} contract{budget.contractsCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <div className="text-left sm:text-right text-xs">
                      <p className="font-bold text-ink">{formatMoney(budget.committed)} committed</p>
                      <p className="text-ink-muted">of {formatMoney(budget.planned)} planned</p>
                    </div>
                  </div>

                  <div className="h-2 rounded-full bg-border overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-ink-muted">
                    <span className="flex items-center gap-1">
                      <IndianRupee className="w-3 h-3" />
                      Remaining: {formatMoney(budget.remaining)}
                    </span>
                    <span>{progress}% used</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};
