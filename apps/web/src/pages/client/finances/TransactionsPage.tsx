import React from 'react';
import { Receipt } from 'lucide-react';
import { Card, Skeleton } from '@marche/ui';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { EmptyState } from '../../../components/common/EmptyState';
import { useApp } from '../../../context/AppContext';
import { useApiResource } from '../../../hooks/useApiResource';
import { paymentsApi } from '../../../lib/payments-api';
import { formatDate, formatMoney } from '../../../lib/finance';

// Every payment the client has made or started making, newest first — real
// Payment rows via paymentsApi.mine, not the fabricated `contracts` array
// this replaced (see finance.ts's own header comment).
export const TransactionsPage: React.FC = () => {
  const { accessToken } = useApp();
  const token = accessToken;

  const payments = useApiResource(() => paymentsApi.mine(token as string), [token], {
    enabled: Boolean(token),
  });
  const items = payments.data?.items ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
          Transactions
        </h1>
        <p className="text-xs text-ink-muted mt-1">Every payment you've made or started making.</p>
      </div>

      {payments.loading && (
        <div className="space-y-3" data-testid="transactions-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-40 mb-2" />
              <Skeleton className="h-3 w-56" />
            </Card>
          ))}
        </div>
      )}

      {payments.error && (
        <Card className="p-6 space-y-3">
          <p className="text-sm text-destructive">{payments.error}</p>
        </Card>
      )}

      {!payments.loading && !payments.error && items.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="No transactions yet"
          description="Payments you make when you hire a provider will show up here."
        />
      )}

      {items.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="divide-y divide-border">
            {items.map((payment) => (
              <div
                key={payment.id}
                className="p-4 flex items-center justify-between gap-4"
                data-testid="transaction-row"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-ink truncate">
                    {payment.connection.job.title}
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    To {payment.connection.providerProfile.displayName} ·{' '}
                    {formatDate(payment.createdAt)}
                  </p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-3">
                  <span className="text-sm font-bold text-ink">{formatMoney(payment.amount)}</span>
                  <StatusBadge status={payment.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
