import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import { Button, Card, Skeleton } from '@marche/ui';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { EmptyState } from '../../../components/common/EmptyState';
import { useApp } from '../../../context/AppContext';
import { useApiResource } from '../../../hooks/useApiResource';
import { paymentsApi } from '../../../lib/payments-api';
import {
  filterPaymentsByDateRange,
  formatDate,
  formatMoney,
  formatWeekRange,
  getCurrentWeekRange,
  shiftWeek,
} from '../../../lib/finance';

export const WeeklySummaryPage: React.FC = () => {
  const { accessToken } = useApp();
  const token = accessToken;

  const payments = useApiResource(() => paymentsApi.mine(token as string), [token], {
    enabled: Boolean(token),
  });
  const allItems = payments.data?.items ?? [];

  const [weekOffset, setWeekOffset] = useState(0);
  const range = shiftWeek(getCurrentWeekRange(), weekOffset);
  const weekItems = filterPaymentsByDateRange(allItems, range);
  const weekPaid = weekItems.filter((p) => p.status === 'PAID');
  const total = weekPaid.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
          Weekly summary
        </h1>
        <p className="text-xs text-ink-muted mt-1">Payments made or started, one week at a time.</p>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          icon={ChevronLeft}
          onClick={() => setWeekOffset((w) => w - 1)}
        >
          Previous
        </Button>
        <span className="text-sm font-semibold text-ink">{formatWeekRange(range)}</span>
        <Button
          variant="outline"
          size="sm"
          icon={ChevronRight}
          iconPosition="right"
          onClick={() => setWeekOffset((w) => w + 1)}
          disabled={weekOffset >= 0}
        >
          Next
        </Button>
      </div>

      {payments.loading ? (
        <Card className="p-6">
          <Skeleton className="h-4 w-40" />
        </Card>
      ) : (
        <Card className="p-6">
          <span className="text-xs font-medium text-ink-muted">Paid this week</span>
          <p className="text-2xl font-bold text-ink mt-1">{formatMoney(total)}</p>
          <p className="text-[11px] text-ink-muted mt-1">
            Across {weekPaid.length} payment{weekPaid.length === 1 ? '' : 's'}
          </p>
        </Card>
      )}

      {!payments.loading && weekItems.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="No payments this week"
          description="Nothing was paid or started in this date range."
        />
      )}

      {weekItems.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="divide-y divide-border">
            {weekItems.map((payment) => (
              <div key={payment.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-ink truncate">
                    {payment.connection.job.title}
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">{formatDate(payment.createdAt)}</p>
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
