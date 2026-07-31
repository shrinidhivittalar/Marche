import { Job } from '../types';

type BudgetLike = Pick<Job, 'budgetMode' | 'budgetMin' | 'budgetMax'>;

export function formatBudget(job: BudgetLike): string {
  if (job.budgetMode === 'fixed') {
    return `₹${job.budgetMin.toLocaleString('en-IN')} (Fixed)`;
  }
  return `₹${job.budgetMin.toLocaleString('en-IN')} - ₹${job.budgetMax.toLocaleString('en-IN')}`;
}

export function isBidWithinBudget(job: BudgetLike, bidAmount: number): boolean {
  if (job.budgetMode === 'fixed') return bidAmount === job.budgetMin;
  return bidAmount >= job.budgetMin && bidAmount <= job.budgetMax;
}
