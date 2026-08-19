import React from 'react';
import { FileSearch, Layers3 } from 'lucide-react';
import { Card, Skeleton } from '@marche/ui';
import { EmptyState } from '../../../components/common/EmptyState';
import { useApp } from '../../../context/AppContext';
import { useApiResource } from '../../../hooks/useApiResource';
import { paymentsApi } from '../../../lib/payments-api';
import { jobsApi } from '../../../lib/jobs-api';
import { formatMoney, getBudgetSummaries } from '../../../lib/finance';

export const BudgetsPage: React.FC = () => {
  const { accessToken } = useApp();
  const token = accessToken;

  const jobs = useApiResource(() => jobsApi.mine(token as string, 1, 100), [token], {
    enabled: Boolean(token),
  });
  const payments = useApiResource(() => paymentsApi.mine(token as string, 1, 100), [token], {
    enabled: Boolean(token),
  });

  const loading = jobs.loading || payments.loading;
  const budgets = getBudgetSummaries(jobs.data?.items ?? [], payments.data?.items ?? []);
  const planned = budgets.reduce((total, b) => total + b.planned, 0);
  const committed = budgets.reduce((total, b) => total + b.committed, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Budgets</h1>
        <p className="text-xs text-ink-muted mt-1">
          Planned budget comes from what you set posting each job; committed is what's actually been
          paid.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-6 w-20" />
            </Card>
          ))}
        </div>
      ) : (
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
            <p className="text-2xl font-bold text-ink mt-2">
              {formatMoney(Math.max(0, planned - committed))}
            </p>
          </Card>
        </div>
      )}

      {!loading && budgets.length === 0 && (
        <EmptyState
          icon={FileSearch}
          title="No budgets yet"
          description="Post a job with a budget range to see category summaries here. Payments you make will be tracked against them."
        />
      )}

      {budgets.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="divide-y divide-border">
            {budgets.map((budget) => {
              const progress =
                budget.planned > 0
                  ? Math.min(100, Math.round((budget.committed / budget.planned) * 100))
                  : 0;

              return (
                <div key={budget.categoryId} className="p-4 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-primary-subtle text-primary flex items-center justify-center shrink-0">
                        <Layers3 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-ink truncate">
                          {budget.categoryName}
                        </h2>
                        <p className="text-xs text-ink-muted">
                          {budget.jobsCount} job{budget.jobsCount === 1 ? '' : 's'} ·{' '}
                          {budget.paymentsCount} payment{budget.paymentsCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <div className="text-left sm:text-right text-xs">
                      <p className="font-bold text-ink">
                        {formatMoney(budget.committed)} committed
                      </p>
                      <p className="text-ink-muted">of {formatMoney(budget.planned)} planned</p>
                    </div>
                  </div>

                  <div className="h-2 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-ink-muted">
                    <span>Remaining: {formatMoney(budget.remaining)}</span>
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
