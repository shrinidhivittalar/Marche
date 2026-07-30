import React, { useState } from 'react';
import { ChevronRight, Folder, Lock, Sliders, X } from 'lucide-react';
import { Card } from '@marche/ui';

type TransactionsTab = 'payments' | 'charges';

export const TransactionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TransactionsTab>('payments');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  return (
    <div className="relative min-h-[70vh] max-w-5xl mx-auto">
      {/* Coming Soon overlay */}
      <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
        <Card className="p-8 max-w-sm text-center space-y-3 shadow-lg">
          <div className="w-12 h-12 mx-auto rounded-xl bg-surface-subtle flex items-center justify-center text-primary">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-ink">Coming Soon</h2>
          <p className="text-xs text-ink-muted leading-relaxed">
            Your full payment and charge history, with filters and downloadable statements, will be
            available here soon.
          </p>
        </Card>
      </div>

      {/* Blurred preview of the finished Transaction History screen */}
      <div className="space-y-6 blur-sm select-none pointer-events-none" aria-hidden="true">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
            Transaction history
          </h1>
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-white text-xs font-semibold text-ink">
            Outstanding balance: ₹0.00
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-6 border-b border-border">
          {(['payments', 'charges'] as TransactionsTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-semibold capitalize border-b-2 -mb-px ${
                activeTab === tab ? 'text-ink border-primary' : 'text-ink-muted border-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {!bannerDismissed && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20 text-xs">
            <span className="flex items-center gap-2 text-ink">
              <Sliders className="w-3.5 h-3.5 text-primary" />
              Looking for filtered totals? Go to the "Charges" tab
            </span>
            <button onClick={() => setBannerDismissed(true)} className="text-ink-muted">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          {[
            ['Date range', 'All time'],
            ['Transaction type', 'All types'],
            ['Payment method', 'All methods'],
          ].map(([label, value]) => (
            <div key={label} className="space-y-1">
              <span className="block text-xs font-semibold text-ink">{label}</span>
              <button className="px-3 py-2 rounded-xl border border-border bg-white text-xs text-ink-muted min-w-[160px] text-left">
                {value}
              </button>
            </div>
          ))}
          <button className="ml-auto text-xs font-medium text-ink-muted">Select download</button>
        </div>

        <Card className="p-16 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-primary flex items-center justify-center">
            <Folder className="w-8 h-8" />
          </div>
          <p className="text-xs text-ink-muted">No transactions found for this date range.</p>
        </Card>
      </div>
    </div>
  );
};
