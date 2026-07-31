import React, { useState } from 'react';
import { Hourglass, History, IndianRupee, Info, FileText, Lock } from 'lucide-react';
import { Button, Card } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';

type FinancesTab = 'overview' | 'transactions' | 'withdrawals';

export const FinancesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FinancesTab>('overview');

  return (
    <div className="relative min-h-[70vh] max-w-6xl mx-auto">
      {/* Coming Soon overlay */}
      <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
        <Card className="p-8 max-w-sm text-center space-y-3 shadow-lg">
          <div className="w-12 h-12 mx-auto rounded-xl bg-surface-subtle flex items-center justify-center text-primary">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-ink">Coming Soon</h2>
          <p className="text-xs text-ink-muted leading-relaxed">
            Transaction history, payout withdrawals, billing reports, and tax documents will be
            available here soon.
          </p>
        </Card>
      </div>

      {/* Blurred preview of the finished Finances screen */}
      <div className="space-y-8 blur-sm select-none pointer-events-none" aria-hidden="true">
        {/* Header */}
        <div className="pb-6 border-b border-border">
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Finances</h1>
          <p className="text-xs text-ink-muted mt-1">
            Track your earnings, review transactions, and manage withdrawals. Full functionality is coming soon.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-border pb-3">
          {(
            [
              ['overview', 'Overview'],
              ['transactions', 'Transactions'],
              ['withdrawals', 'Withdrawals'],
            ] as [FinancesTab, string][]
          ).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeTab === tab
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-white text-ink-muted hover:text-ink border border-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* TAB 1: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-5">
                <span className="text-xs font-medium text-ink-muted">Work in progress</span>
                <p className="text-2xl font-bold text-ink mt-2">₹0.00</p>
              </Card>
              <Card className="p-5">
                <span className="text-xs font-medium text-ink-muted">In review</span>
                <p className="text-2xl font-bold text-ink mt-2">₹0.00</p>
              </Card>
              <Card className="p-5">
                <span className="text-xs font-medium text-ink-muted">Pending</span>
                <p className="text-2xl font-bold text-ink mt-2">₹0.00</p>
              </Card>
              <Card className="p-5">
                <span className="text-xs font-medium text-ink-muted">Available</span>
                <p className="text-2xl font-bold text-ink mt-2">₹0.00</p>
                <p className="text-[11px] text-ink-muted mt-1">Last payment: ₹0.00</p>
              </Card>
            </div>

            <EmptyState
              title="You have no work in progress"
              description="Once you win a contract and start delivering, your active earnings will show up here."
            />

            <p className="text-[11px] text-ink-muted">Note: this report is updated every hour.</p>
          </div>
        )}

        {/* TAB 2: Transactions */}
        {activeTab === 'transactions' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-5 space-y-2">
                <div className="flex items-center justify-between text-ink-muted">
                  <span className="text-xs font-medium">Pending earnings</span>
                  <Hourglass className="w-4 h-4" />
                </div>
                <p className="text-xl font-bold text-ink">₹0.00</p>
                <p className="text-[11px] text-ink-muted">No pending transactions</p>
              </Card>

              <Card className="p-5 space-y-2">
                <div className="flex items-center justify-between text-ink-muted">
                  <span className="text-xs font-medium">Withdrawal schedule</span>
                  <History className="w-4 h-4" />
                </div>
                <p className="text-[11px] text-ink-muted leading-relaxed">
                  You'll be able to set up a withdrawal schedule once you've added a withdrawal method.
                </p>
                <Button size="sm" variant="ghost" disabled className="px-0 h-auto">
                  Add withdrawal method
                </Button>
              </Card>

              <Card className="p-5 space-y-2">
                <div className="flex items-center justify-between text-ink-muted">
                  <span className="text-xs font-medium">Available balance</span>
                  <IndianRupee className="w-4 h-4" />
                </div>
                <p className="text-xl font-bold text-ink">₹0.00</p>
                <Button size="sm" variant="secondary" disabled>
                  Withdrawals
                </Button>
              </Card>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {[
                ['Date range', 'All time'],
                ['Transaction type', 'All types'],
                ['Client', 'All clients'],
                ['Contract', 'All contracts'],
              ].map(([label, value]) => (
                <div key={label} className="space-y-1">
                  <span className="block text-[10px] text-ink-muted">{label}</span>
                  <button
                    disabled
                    className="px-3 py-2 rounded-xl border border-border bg-bg text-ink-muted text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {value}
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-ink-muted">Quick filters:</span>
              {['Earnings', 'Withdrawals', 'Last year', 'This year'].map((label) => (
                <button
                  key={label}
                  disabled
                  className="px-3 py-1.5 rounded-full border border-border bg-bg text-ink-muted text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-4 bg-surface-subtle border border-border rounded-xl flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-ink">Filtered totals</span>
              <span className="text-ink-muted">
                Select a filter to get a breakdown of your earnings, fees, and taxes.
              </span>
            </div>

            <EmptyState
              title="No transactions yet"
              description="Your earnings, withdrawals, and fees will appear here once you complete your first contract."
            />
          </div>
        )}

        {/* TAB 3: Withdrawals */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-6">
            <Card className="p-6 flex flex-col md:flex-row items-center gap-6">
              <div className="w-14 h-14 rounded-xl bg-surface-subtle flex items-center justify-center text-primary shrink-0">
                <FileText className="w-7 h-7" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-base font-bold text-ink">
                  Complete your tax profile to access funds in your account
                </h3>
                <p className="text-xs text-ink-muted mt-1">
                  You need to validate your tax information to comply with local tax authorities before
                  adding a withdrawal method.
                </p>
              </div>
              <Button disabled className="shrink-0">
                Tax information
              </Button>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5 space-y-2">
                <span className="text-xs font-medium text-ink-muted">Available balance</span>
                <p className="text-2xl font-bold text-ink">₹0.00</p>
                <p className="text-[11px] text-ink-muted">+₹0.00 pending</p>
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 mt-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>To withdraw earnings, please update your tax information.</span>
                </div>
              </Card>

              <Card className="p-5 space-y-2">
                <span className="text-xs font-medium text-ink-muted">Withdrawal schedule</span>
                <p className="text-[11px] text-ink-muted leading-relaxed">
                  You haven't set up a schedule yet. You'll be able to set it up once you've added a
                  withdrawal method.
                </p>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
