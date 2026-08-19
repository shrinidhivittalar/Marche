import React from 'react';
import { ArrowRight, Receipt } from 'lucide-react';
import { Card, Skeleton } from '@marche/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { paymentsApi } from '../../lib/payments-api';
import { formatDate, formatMoney } from '../../lib/finance';

// The "Finances" nav item's own landing page — a quick overview, with the
// full breakdowns (Weekly summary, Transactions, Budgets) one click away in
// the sidebar's own submenu (Sidebar.tsx's FINANCES_LINKS).
export const PaymentsOverviewPage: React.FC = () => {
  const { accessToken, navigate } = useApp();
  const token = accessToken;

  const payments = useApiResource(() => paymentsApi.mine(token as string, 1, 5), [token], {
    enabled: Boolean(token),
  });
  const recent = payments.data?.items ?? [];
  const paidCount = recent.filter((p) => p.status === 'PAID').length;
  const totalPaid = recent
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Finances</h1>
        <p className="text-xs text-ink-muted mt-1">
          A quick look at your payments — see Weekly summary, Transactions, and Budgets in the menu
          for the full picture.
        </p>
      </div>

      {payments.loading ? (
        <Card className="p-6 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </Card>
      ) : recent.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No payments yet"
          description="Payments you make when you hire a provider will show up here."
        />
      ) : (
        <>
          <Card className="p-6">
            <span className="text-xs font-medium text-ink-muted">Paid, most recent 5</span>
            <p className="text-2xl font-bold text-ink mt-1">{formatMoney(totalPaid)}</p>
            <p className="text-[11px] text-ink-muted mt-1">
              {paidCount} of {recent.length} recent payments completed
            </p>
          </Card>

          <Card padding="none" className="overflow-hidden">
            <div className="divide-y divide-border">
              {recent.map((payment) => (
                <div key={payment.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-ink truncate">
                      {payment.connection.job.title}
                    </h3>
                    <p className="text-xs text-ink-muted mt-0.5">{formatDate(payment.createdAt)}</p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-3">
                    <span className="text-sm font-bold text-ink">
                      {formatMoney(payment.amount)}
                    </span>
                    <StatusBadge status={payment.status} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <button
            type="button"
            onClick={() => navigate('/client/finances/transactions')}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
          >
            See all transactions <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
};
