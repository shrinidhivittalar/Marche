// Derivations shared by the client Finances screens (Transactions, Weekly
// Summary, Budgets) and the provider Finances screen — all views over the
// same two real sources: Payment rows (paymentsApi.mine) and, for Budgets
// only, the client's own posted Jobs (jobsApi.mine). A file by this name
// existed before and was deleted (see FEATURE_GAP_ANALYSIS.md) because it
// held fabricated mock-array math; this is a rewrite against the real
// Payment/Job data now that both exist, not a resurrection of the old one.
import type { ApiPaymentWithConnection } from './payments-api';
import type { ApiJob } from './jobs-api';

export function formatMoney(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return `₹${n.toLocaleString('en-IN')}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export interface DateRange {
  start: Date;
  end: Date;
}

export function getCurrentWeekRange(referenceDate = new Date()): DateRange {
  const start = new Date(referenceDate);
  const day = start.getDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - distanceFromMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function shiftWeek(range: DateRange, weeks: number): DateRange {
  const start = new Date(range.start);
  const end = new Date(range.end);
  start.setDate(start.getDate() + weeks * 7);
  end.setDate(end.getDate() + weeks * 7);
  return { start, end };
}

export function formatWeekRange(range: DateRange): string {
  return `${formatDate(range.start.toISOString())} – ${formatDate(range.end.toISOString())}`;
}

export function filterPaymentsByDateRange(
  payments: ApiPaymentWithConnection[],
  range: DateRange,
): ApiPaymentWithConnection[] {
  return payments.filter((p) => {
    const date = new Date(p.createdAt);
    return date >= range.start && date <= range.end;
  });
}

export interface BudgetSummary {
  categoryId: string;
  categoryName: string;
  planned: number;
  committed: number;
  remaining: number;
  jobsCount: number;
  paymentsCount: number;
}

// A job never leaving DRAFT never represented a real spending intent, and a
// CANCELLED one no longer does — both excluded from "planned" for the same
// reason the old (fabricated) version of this excluded them.
const EXCLUDED_BUDGET_STATUSES = new Set(['DRAFT', 'CANCELLED']);

/**
 * Per-category planned vs. committed spend.
 *
 * "Planned" sums each eligible job's own budget ceiling (budgetMax, falling
 * back to budgetMin for a job posted with only one bound set) — a real
 * field set at posting time, not invented for this page. "Committed" sums
 * PAID payments in that category — CREATED/FAILED ones don't count as
 * spend yet, matching what Transactions calls them.
 */
export function getBudgetSummaries(
  jobs: ApiJob[],
  payments: ApiPaymentWithConnection[],
): BudgetSummary[] {
  const eligibleJobs = jobs.filter((j) => !EXCLUDED_BUDGET_STATUSES.has(j.status));
  const paidPayments = payments.filter((p) => p.status === 'PAID');

  const categoryIds = Array.from(new Set(eligibleJobs.map((j) => j.category.id)));

  return categoryIds
    .map((categoryId) => {
      const categoryJobs = eligibleJobs.filter((j) => j.category.id === categoryId);
      const categoryPayments = paidPayments.filter(
        (p) => p.connection.job.categoryId === categoryId,
      );
      const planned = categoryJobs.reduce(
        (sum, j) => sum + Number(j.budgetMax ?? j.budgetMin ?? 0),
        0,
      );
      const committed = categoryPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      // categoryId came from mapping eligibleJobs itself, so this filter can
      // never be empty — the fallback name is unreachable, not a real state.
      return {
        categoryId,
        categoryName: categoryJobs[0]?.category.name ?? 'Uncategorised',
        planned,
        committed,
        remaining: Math.max(0, planned - committed),
        jobsCount: categoryJobs.length,
        paymentsCount: categoryPayments.length,
      };
    })
    .sort((a, b) => b.planned - a.planned);
}
