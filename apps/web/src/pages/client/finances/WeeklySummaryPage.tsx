import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, CircleHelp, Lock } from 'lucide-react';
import { Card } from '@marche/ui';

export const WeeklySummaryPage: React.FC = () => {
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
            Weekly hours, contract breakdowns, and activity summaries will be available here soon.
          </p>
        </Card>
      </div>

      {/* Blurred preview of the finished Weekly Summary screen */}
      <div className="space-y-6 blur-sm select-none pointer-events-none" aria-hidden="true">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Weekly summary</h1>

        <div>
          <span className="block text-xs font-semibold text-ink mb-1.5">Select week</span>
          <div className="flex items-center gap-3">
            <button className="p-1 text-ink-muted">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-white text-xs font-medium text-ink">
              <span>Jul 27 – Aug 2, 2026</span>
              <Calendar className="w-3.5 h-3.5 text-ink-muted" />
            </div>
            <button className="p-1 text-ink-muted">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="flex items-center gap-1.5 text-xs text-ink-muted ml-2">
              Times based on UTC.
              <CircleHelp className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-bold text-ink">Totals</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Hourly (0:00 hrs)</span>
                <span className="font-semibold text-ink">₹0.00</span>
              </div>
              <div className="flex items-center justify-between pl-3">
                <span className="text-ink-muted">└ Manual time (0:00 hrs)</span>
                <span className="font-semibold text-ink">₹0.00</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-ink-muted">Fixed price and other</span>
                <span className="font-semibold text-ink">₹0.00</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border font-bold text-ink">
                <span>Total</span>
                <span>₹0.00</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-bold text-ink">Top 5 contracts</h3>
            <div className="h-32 flex items-center justify-center text-center text-xs text-ink-muted">
              There is no data for the selected week
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-bold text-ink">Top 5 activities</h3>
            <div className="h-32 flex items-center justify-center text-center text-xs text-ink-muted">
              There is no data for the selected week
            </div>
          </Card>
        </div>

        <h2 className="text-xl font-extrabold text-ink tracking-tight pt-2">Hourly</h2>
      </div>
    </div>
  );
};
