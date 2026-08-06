import React, { useState } from 'react';
import { FileText, History, Hourglass, IndianRupee, ReceiptText, Wallet } from 'lucide-react';
import { Button, Card } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useApp } from '../../context/AppContext';
import { formatDate, formatMoney, getProviderFinanceTotals, getProviderTransactions } from '../../lib/finance';

type FinancesTab = 'overview' | 'transactions' | 'withdrawals';

export const FinancesPage: React.FC = () => {
  const { currentUser, contracts } = useApp();
  const [activeTab, setActiveTab] = useState<FinancesTab>('overview');
  const totals = getProviderFinanceTotals(contracts, currentUser.id);
  const transactions = getProviderTransactions(contracts, currentUser.id);
  const activeTransactions = transactions.filter((transaction) => transaction.status === 'Work in progress');
  const inReviewTransactions = transactions.filter((transaction) => transaction.status === 'In review');
  const availableTransactions = transactions.filter((transaction) => transaction.status === 'Available');

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Finances</h1>
        <p className="text-xs text-ink-muted mt-1">
          Frontend earnings ledger generated from your contracts. Withdrawals and real payouts need a payment provider.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
        {(
          [
            ['overview', 'Overview'],
            ['transactions', 'Transactions'],
            ['withdrawals', 'Withdrawals'],
          ] as [FinancesTab, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer shrink-0 ${
              activeTab === tab
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-surface text-ink-muted hover:text-ink border border-border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5">
              <span className="text-xs font-medium text-ink-muted">Work in progress</span>
              <p className="text-2xl font-bold text-ink mt-2">{formatMoney(totals.workInProgress)}</p>
            </Card>
            <Card className="p-5">
              <span className="text-xs font-medium text-ink-muted">In review</span>
              <p className="text-2xl font-bold text-ink mt-2">{formatMoney(totals.inReview)}</p>
            </Card>
            <Card className="p-5">
              <span className="text-xs font-medium text-ink-muted">Pending</span>
              <p className="text-2xl font-bold text-ink mt-2">{formatMoney(totals.pending)}</p>
            </Card>
            <Card className="p-5">
              <span className="text-xs font-medium text-ink-muted">Available</span>
              <p className="text-2xl font-bold text-ink mt-2">{formatMoney(totals.available)}</p>
              <p className="text-[11px] text-ink-muted mt-1">Last closed contract: {formatMoney(totals.lastPayment)}</p>
            </Card>
          </div>

          {activeTransactions.length === 0 ? (
            <EmptyState
              title="No active earnings"
              description="Confirmed contracts you are currently delivering will appear here."
              icon={Wallet}
            />
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="divide-y divide-border">
                {activeTransactions.map((transaction) => (
                  <div key={transaction.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{transaction.jobTitle}</p>
                      <p className="text-ink-muted mt-0.5">{transaction.counterpartyName} - {formatDate(transaction.date)}</p>
                    </div>
                    <span className="font-bold text-ink shrink-0">{formatMoney(transaction.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 space-y-2">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-medium">Pending earnings</span>
                <Hourglass className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold text-ink">{formatMoney(totals.pending)}</p>
              <p className="text-[11px] text-ink-muted">From active and in-review contracts</p>
            </Card>

            <Card className="p-5 space-y-2">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-medium">Closed earnings</span>
                <History className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold text-ink">{formatMoney(totals.available)}</p>
              <p className="text-[11px] text-ink-muted">Available in this frontend ledger</p>
            </Card>

            <Card className="p-5 space-y-2">
              <div className="flex items-center justify-between text-ink-muted">
                <span className="text-xs font-medium">Lifetime contract value</span>
                <IndianRupee className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold text-ink">{formatMoney(totals.lifetime)}</p>
            </Card>
          </div>

          {transactions.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              description="Your contract earnings will appear here once a client hires you."
              icon={ReceiptText}
            />
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="divide-y divide-border">
                {transactions.map((transaction) => (
                  <div key={transaction.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{transaction.jobTitle}</p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {transaction.counterpartyName} - {transaction.category} - {formatDate(transaction.date)}
                      </p>
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
      )}

      {activeTab === 'withdrawals' && (
        <div className="space-y-6">
          <Card className="p-6 flex flex-col md:flex-row items-center gap-6">
            <div className="w-14 h-14 rounded-xl bg-surface-subtle flex items-center justify-center text-primary shrink-0">
              <FileText className="w-7 h-7" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-base font-bold text-ink">Withdrawal setup</h3>
              <p className="text-xs text-ink-muted mt-1">
                Withdrawal methods are not connected yet. Available balance below is derived only from closed contracts.
              </p>
            </div>
            <Button disabled className="shrink-0">
              Add withdrawal method
            </Button>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5 space-y-2">
              <span className="text-xs font-medium text-ink-muted">Available balance</span>
              <p className="text-2xl font-bold text-ink">{formatMoney(totals.available)}</p>
              <p className="text-[11px] text-ink-muted">+{formatMoney(totals.pending)} pending</p>
            </Card>

            <Card className="p-5 space-y-2">
              <span className="text-xs font-medium text-ink-muted">In review</span>
              <p className="text-2xl font-bold text-ink">{formatMoney(totals.inReview)}</p>
              <p className="text-[11px] text-ink-muted">From contracts marked complete by you and waiting for client confirmation.</p>
            </Card>
          </div>

          {availableTransactions.length === 0 && inReviewTransactions.length === 0 && (
            <EmptyState
              title="No withdrawable earnings"
              description="Closed contracts will move into available balance. Completed contracts waiting on the client stay in review."
              icon={Wallet}
            />
          )}
        </div>
      )}
    </div>
  );
};
