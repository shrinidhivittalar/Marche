import React from 'react';
import { FileSearch, Lock } from 'lucide-react';
import { Button, Card } from '@marche/ui';

export const BudgetsPage: React.FC = () => {
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
            Setting spend limits and tracking budgets by category will be available here soon.
          </p>
        </Card>
      </div>

      {/* Blurred preview of the finished Budgets screen */}
      <div className="space-y-6 blur-sm select-none pointer-events-none" aria-hidden="true">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Budgets</h1>
          <Button variant="outline" size="sm">
            Manage activity codes
          </Button>
        </div>

        <Card className="p-16 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-primary flex items-center justify-center">
            <FileSearch className="w-8 h-8" />
          </div>
          <p className="text-sm font-bold text-ink">There are no budgets</p>
        </Card>
      </div>
    </div>
  );
};
