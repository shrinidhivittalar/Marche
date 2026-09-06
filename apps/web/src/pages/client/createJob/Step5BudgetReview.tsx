import { IndianRupee } from 'lucide-react';
import { Card, Input } from '@marche/ui';
import { formatEventSchedule } from '../../../lib/formatTime';
import { formatJobBudget } from '../../../lib/formatJob';
import type { CreateJobForm } from './useCreateJobForm';

export function Step5BudgetReview({ form }: { form: CreateJobForm }) {
  const {
    budgetMode,
    setBudgetMode,
    budgetMin,
    setBudgetMin,
    budgetMax,
    setBudgetMax,
    attemptedNext,
    title,
    selectedCategory,
    eventDate,
    timingMode,
    eventStartTime,
    eventEndTime,
    location,
    proposalDeadline,
    attachments,
  } = form;

  return (
    <Card padding="lg" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight leading-snug">
            Set your target budget.
          </h2>
          <p className="text-sm text-ink-muted mt-3 leading-relaxed max-w-sm">
            Set a fixed amount or a realistic range — this is what talent sees when deciding whether
            to propose. Leave it at zero to invite quotes instead.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-2">
              How do you want to set the budget?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setBudgetMode('fixed')}
                className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                  budgetMode === 'fixed'
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                    : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
                }`}
              >
                Fixed budget
                <span className="block font-normal mt-0.5">A single figure</span>
              </button>
              <button
                type="button"
                onClick={() => setBudgetMode('range')}
                className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                  budgetMode === 'range'
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                    : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
                }`}
              >
                Budget range
                <span className="block font-normal mt-0.5">A minimum and a maximum</span>
              </button>
            </div>
          </div>

          {budgetMode === 'fixed' ? (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                <IndianRupee className="w-3.5 h-3.5 text-ink-muted" />
                Fixed Budget (₹)
              </label>
              <Input
                type="number"
                step={100}
                min={0}
                value={budgetMin}
                onChange={(e) => setBudgetMin(Math.max(0, Number(e.target.value)))}
                data-testid="job-budget-input"
                className="font-mono"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                  <IndianRupee className="w-3.5 h-3.5 text-ink-muted" />
                  Minimum Budget (₹)
                </label>
                <Input
                  type="number"
                  step={100}
                  min={0}
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(Math.max(0, Number(e.target.value)))}
                  data-testid="job-budget-input"
                  className="font-mono"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                  <IndianRupee className="w-3.5 h-3.5 text-ink-muted" />
                  Maximum Budget (₹)
                </label>
                <Input
                  type="number"
                  step={100}
                  min={0}
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(Math.max(0, Number(e.target.value)))}
                  className="font-mono"
                  aria-invalid={attemptedNext && budgetMax > 0 && budgetMax < budgetMin}
                />
                {attemptedNext && budgetMax > 0 && budgetMax < budgetMin ? (
                  <p className="text-[11px] text-destructive mt-1 font-medium">
                    Maximum must be at least the minimum.
                  </p>
                ) : (
                  <p className="text-[11px] text-ink-muted mt-1">
                    Leave at zero for no upper limit.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 bg-bg border border-border rounded-2xl space-y-4">
        <h3 className="text-xs font-mono uppercase font-bold text-primary tracking-wider">
          Requirement Summary
        </h3>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-ink-muted">Title:</span>
            <span className="font-semibold text-ink text-right">{title}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-ink-muted">Category:</span>
            <span className="font-medium text-ink">{selectedCategory?.name ?? '—'}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-ink-muted">Logistics:</span>
            <span className="font-medium text-ink text-right">
              {eventDate
                ? formatEventSchedule(eventDate, timingMode, eventStartTime, eventEndTime)
                : 'No date set'}
              {location ? ` — ${location}` : ''}
            </span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-ink-muted">Proposal Deadline:</span>
            <span className="font-medium text-ink">{proposalDeadline || 'None'}</span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-ink-muted">Budget:</span>
            {/* Formatted from the same values buildBody sends, so the
                summary cannot claim a budget the API will not store. */}
            <span className="font-bold text-primary" data-testid="summary-budget">
              {formatJobBudget({
                budgetMin: budgetMin > 0 ? String(budgetMin) : null,
                budgetMax:
                  budgetMode === 'fixed'
                    ? budgetMin > 0
                      ? String(budgetMin)
                      : null
                    : budgetMax > 0
                      ? String(budgetMax)
                      : null,
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Reference Documents:</span>
            <span className="font-medium text-ink">
              {attachments.length > 0 ? `${attachments.length} attached` : 'None'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
