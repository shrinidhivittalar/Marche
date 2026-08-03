import React, { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, CircleHelp, Folder } from 'lucide-react';
import { Card } from '@marche/ui';
import { EmptyState } from '../../../components/common/EmptyState';
import { useApp } from '../../../context/AppContext';
import {
  filterTransactionsByDateRange,
  formatDate,
  formatMoney,
  formatWeekRange,
  getClientTransactions,
  getCurrentWeekRange,
  shiftWeek,
} from '../../../lib/finance';

export const WeeklySummaryPage: React.FC = () => {
  const { currentUser, contracts } = useApp();
  const [weekOffset, setWeekOffset] = useState(0);
  const weekRange = shiftWeek(getCurrentWeekRange(), weekOffset);
  const transactions = getClientTransactions(contracts, currentUser.id);
  const weeklyTransactions = filterTransactionsByDateRange(transactions, weekRange);
  const weeklyTotal = weeklyTransactions.reduce((total, transaction) => total + transaction.amount, 0);
  const topContracts = [...weeklyTransactions].sort((a, b) => b.amount - a.amount).slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Weekly summary</h1>
        <p className="text-xs text-ink-muted mt-1">
          Frontend ledger generated from your contracts. No escrow or payment provider is connected yet.
        </p>
      </div>

      <div>
        <span className="block text-xs font-semibold text-ink mb-1.5">Select week</span>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setWeekOffset((value) => value - 1)}
            className="p-1 text-ink-muted hover:text-ink cursor-pointer"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-surface text-xs font-medium text-ink">
            <span>{formatWeekRange(weekRange)}</span>
            <Calendar className="w-3.5 h-3.5 text-ink-muted" />
          </div>
          <button
            type="button"
            onClick={() => setWeekOffset((value) => value + 1)}
            className="p-1 text-ink-muted hover:text-ink cursor-pointer"
            aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="flex items-center gap-1.5 text-xs text-ink-muted ml-0 sm:ml-2">
            Based on contract activity dates.
            <CircleHelp className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-ink">Totals</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Contract charges</span>
              <span className="font-semibold text-ink">{formatMoney(weeklyTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">Contracts</span>
              <span className="font-semibold text-ink">{weeklyTransactions.length}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border font-bold text-ink">
              <span>Total</span>
              <span>{formatMoney(weeklyTotal)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-3 md:col-span-2">
          <h3 className="text-sm font-bold text-ink">Top contracts</h3>
          {topContracts.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-center text-xs text-ink-muted">
              There is no contract activity for the selected week.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {topContracts.map((transaction) => (
                <div key={transaction.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink truncate">{transaction.jobTitle}</p>
                    <p className="text-ink-muted mt-0.5">
                      {transaction.counterpartyName} - {formatDate(transaction.date)}
                    </p>
                  </div>
                  <span className="font-bold text-ink shrink-0">{formatMoney(transaction.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {weeklyTransactions.length === 0 && (
        <EmptyState
          title="No weekly finance activity"
          description="Contracts created or completed during the selected week will appear here."
          icon={Folder}
        />
      )}
    </div>
  );
};
