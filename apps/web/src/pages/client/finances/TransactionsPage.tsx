import React, { useState } from 'react';
import { ChevronRight, Folder, IndianRupee, ReceiptText } from 'lucide-react';
import { Card } from '@marche/ui';
import { EmptyState } from '../../../components/common/EmptyState';
import { useApp } from '../../../context/AppContext';
import { formatDate, formatMoney, getClientFinanceTotals, getClientTransactions } from '../../../lib/finance';

type TransactionsTab = 'charges' | 'payments';

export const TransactionsPage: React.FC = () => {
  const { currentUser, contracts, navigate } = useApp();
  const [activeTab, setActiveTab] = useState<TransactionsTab>('charges');
  const transactions = getClientTransactions(contracts, currentUser.id);
  const totals = getClientFinanceTotals(contracts, currentUser.id);
  const visibleTransactions = transactions.filter((transaction) =>
    activeTab === 'payments' ? transaction.status === 'Paid' : transaction.status !== 'Paid'
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Transaction history</h1>
          <p className="text-xs text-ink-muted mt-1">
            Frontend ledger generated from contract records. No real payment processor is connected yet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/client/finances/budgets')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-surface text-xs font-semibold text-ink hover:border-border-strong cursor-pointer"
        >
          Outstanding balance: {formatMoney(totals.outstanding)}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <span className="text-xs font-medium text-ink-muted">Committed</span>
          <p className="text-2xl font-bold text-ink mt-2">{formatMoney(totals.committed)}</p>
        </Card>
        <Card className="p-5">
          <span className="text-xs font-medium text-ink-muted">In review</span>
          <p className="text-2xl font-bold text-ink mt-2">{formatMoney(totals.inReview)}</p>
        </Card>
        <Card className="p-5">
          <span className="text-xs font-medium text-ink-muted">Paid</span>
          <p className="text-2xl font-bold text-ink mt-2">{formatMoney(totals.paid)}</p>
        </Card>
      </div>

      <div className="flex items-center gap-6 border-b border-border">
        {(
          [
            ['charges', 'Outstanding charges'],
            ['payments', 'Paid'],
          ] as [TransactionsTab, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-sm font-semibold border-b-2 -mb-px cursor-pointer ${
              tab === activeTab ? 'text-ink border-primary' : 'text-ink-muted border-transparent hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visibleTransactions.length === 0 ? (
        <EmptyState
          title="No transactions found"
          description="Matching contract charges and payments will appear here as your bookings move through the lifecycle."
          icon={Folder}
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="divide-y divide-border">
            {visibleTransactions.map((transaction) => (
              <div key={transaction.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-primary-subtle text-primary flex items-center justify-center shrink-0">
                    {transaction.status === 'Paid' ? <ReceiptText className="w-4 h-4" /> : <IndianRupee className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{transaction.jobTitle}</p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {transaction.counterpartyName} - {transaction.category} - {formatDate(transaction.date)}
                    </p>
                  </div>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <p className="text-sm font-bold text-ink">{formatMoney(transaction.amount)}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">{transaction.status}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
