import React from 'react';
import { CheckCircle2, Clock3, IndianRupee, Receipt } from 'lucide-react';
import { Card, Skeleton } from '@marche/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { fetchAllPages } from '../../lib/api-fetch';
import { paymentsApi } from '../../lib/payments-api';
import { formatDate, formatMoney } from '../../lib/finance';

// The provider-side mirror of the client's Finances pages — real payments
// received (paymentsApi.mine reads the provider side of the same Payment
// rows the client side reads), not the fabricated per-status totals
// (workInProgress/inReview/available) the old removed version invented.
// There's no escrow or platform holding period in this design (0% Phase 1
// commission — see ContractDetailPage's invoice note), so the only real
// states are: paid, or not yet.
export const FinancesPage: React.FC = () => {
  const { accessToken } = useApp();
  const token = accessToken;

  // totalEarned/totalPending sum over every payment, not a page's worth — a
  // 100-row cap would silently understate them past that many.
  const payments = useApiResource(
    () => fetchAllPages((page) => paymentsApi.mine(token as string, page, 100)),
    [token],
    { enabled: Boolean(token) },
  );
  const items = payments.data ?? [];
  const paid = items.filter((p) => p.status === 'PAID');
  const pending = items.filter((p) => p.status === 'CREATED');
  const totalEarned = paid.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPending = pending.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Finances</h1>
        <p className="text-xs text-ink-muted mt-1">Payments from clients you've been hired by.</p>
      </div>

      {payments.loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-6 w-20" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-5">
            <div className="flex items-center justify-between text-ink-muted mb-2">
              <span className="text-xs font-medium">Total earned</span>
              <CheckCircle2 className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-ink">{formatMoney(totalEarned)}</p>
            <p className="text-[11px] text-ink-muted mt-1">
              {paid.length} paid booking{paid.length === 1 ? '' : 's'} · 0% platform commission
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between text-ink-muted mb-2">
              <span className="text-xs font-medium">Awaiting payment</span>
              <Clock3 className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-ink">{formatMoney(totalPending)}</p>
            <p className="text-[11px] text-ink-muted mt-1">
              {pending.length} booking{pending.length === 1 ? '' : 's'} hired but not yet paid
            </p>
          </Card>
        </div>
      )}

      {!payments.loading && items.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="No payments yet"
          description="Payments from clients who hire you will show up here."
        />
      )}

      {items.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="divide-y divide-border">
            {items.map((payment) => (
              <div
                key={payment.id}
                className="p-4 flex items-center justify-between gap-4"
                data-testid="earning-row"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-subtle text-primary flex items-center justify-center shrink-0">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-ink truncate">
                      {payment.connection.job.title}
                    </h3>
                    <p className="text-xs text-ink-muted mt-0.5">
                      From {payment.connection.clientProfile.displayName} ·{' '}
                      {formatDate(payment.createdAt)}
                    </p>
                  </div>
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
