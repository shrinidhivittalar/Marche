import type { BookingState, Contract, EventCategory, Job } from '../types';

export type FinanceTransactionKind = 'charge' | 'earning';

export interface FinanceTransaction {
  id: string;
  contractId: string;
  jobId: string;
  jobTitle: string;
  category: EventCategory;
  counterpartyName: string;
  amount: number;
  date: string;
  status: string;
  kind: FinanceTransactionKind;
}

export interface ProviderFinanceTotals {
  workInProgress: number;
  inReview: number;
  available: number;
  pending: number;
  lifetime: number;
  lastPayment: number;
}

export interface ClientFinanceTotals {
  committed: number;
  inReview: number;
  paid: number;
  total: number;
  outstanding: number;
}

export interface BudgetSummary {
  category: EventCategory;
  planned: number;
  committed: number;
  remaining: number;
  jobsCount: number;
  contractsCount: number;
}

const MONEY_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function sumAmounts(items: { amount: number }[]): number {
  return items.reduce((total, item) => total + item.amount, 0);
}

function isActiveState(state: BookingState): boolean {
  return state === 'Confirmed' || state === 'In Progress';
}

function isCountedContract(contract: Contract): boolean {
  return contract.bookingState !== 'Cancelled' && contract.bookingState !== 'Rejected' && contract.bookingState !== 'Expired';
}

function contractSortDate(contract: Contract): string {
  return contract.clientConfirmedAt ?? contract.vendorCompletedAt ?? contract.createdAt;
}

function clientTransactionStatus(state: BookingState): string {
  if (state === 'Closed') return 'Paid';
  if (state === 'Completed') return 'In review';
  if (isActiveState(state)) return 'Committed';
  return state;
}

function providerTransactionStatus(state: BookingState): string {
  if (state === 'Closed') return 'Available';
  if (state === 'Completed') return 'In review';
  if (isActiveState(state)) return 'Work in progress';
  return state;
}

export function formatMoney(amount: number): string {
  return MONEY_FORMATTER.format(amount);
}

export function formatDate(iso: string): string {
  return DATE_FORMATTER.format(new Date(iso));
}

export function getClientContracts(contracts: Contract[], clientId: string): Contract[] {
  return contracts.filter((contract) => contract.clientId === clientId && isCountedContract(contract));
}

export function getProviderContracts(contracts: Contract[], vendorId: string): Contract[] {
  return contracts.filter((contract) => contract.vendorId === vendorId && isCountedContract(contract));
}

export function getClientTransactions(contracts: Contract[], clientId: string): FinanceTransaction[] {
  return getClientContracts(contracts, clientId)
    .map((contract) => ({
      id: `client_${contract.id}`,
      contractId: contract.id,
      jobId: contract.jobId,
      jobTitle: contract.jobTitle,
      category: contract.category,
      counterpartyName: contract.vendorName,
      amount: contract.amount,
      date: contractSortDate(contract),
      status: clientTransactionStatus(contract.bookingState),
      kind: 'charge' as const,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getProviderTransactions(contracts: Contract[], vendorId: string): FinanceTransaction[] {
  return getProviderContracts(contracts, vendorId)
    .map((contract) => ({
      id: `provider_${contract.id}`,
      contractId: contract.id,
      jobId: contract.jobId,
      jobTitle: contract.jobTitle,
      category: contract.category,
      counterpartyName: contract.clientName,
      amount: contract.amount,
      date: contractSortDate(contract),
      status: providerTransactionStatus(contract.bookingState),
      kind: 'earning' as const,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getProviderFinanceTotals(contracts: Contract[], vendorId: string): ProviderFinanceTotals {
  const providerContracts = getProviderContracts(contracts, vendorId);
  const workInProgress = sumAmounts(providerContracts.filter((contract) => isActiveState(contract.bookingState)));
  const inReview = sumAmounts(providerContracts.filter((contract) => contract.bookingState === 'Completed'));
  const availableContracts = providerContracts.filter((contract) => contract.bookingState === 'Closed');
  const available = sumAmounts(availableContracts);
  const mostRecentAvailable = [...availableContracts].sort(
    (a, b) => new Date(contractSortDate(b)).getTime() - new Date(contractSortDate(a)).getTime()
  )[0];

  return {
    workInProgress,
    inReview,
    available,
    pending: workInProgress + inReview,
    lifetime: sumAmounts(providerContracts),
    lastPayment: mostRecentAvailable?.amount ?? 0,
  };
}

export function getClientFinanceTotals(contracts: Contract[], clientId: string): ClientFinanceTotals {
  const clientContracts = getClientContracts(contracts, clientId);
  const committed = sumAmounts(clientContracts.filter((contract) => isActiveState(contract.bookingState)));
  const inReview = sumAmounts(clientContracts.filter((contract) => contract.bookingState === 'Completed'));
  const paid = sumAmounts(clientContracts.filter((contract) => contract.bookingState === 'Closed'));

  return {
    committed,
    inReview,
    paid,
    total: committed + inReview + paid,
    outstanding: committed + inReview,
  };
}

const EXCLUDED_BUDGET_STATES: BookingState[] = ['Draft', 'Cancelled', 'Rejected', 'Expired'];

export function getBudgetSummaries(jobs: Job[], contracts: Contract[], clientId: string): BudgetSummary[] {
  const clientJobs = jobs.filter(
    (job) => job.clientId === clientId && !job.isDraftPost && !EXCLUDED_BUDGET_STATES.includes(job.status)
  );
  const clientContracts = getClientContracts(contracts, clientId);
  const categories = Array.from(new Set(clientJobs.map((job) => job.category)));

  return categories
    .map((category) => {
      const categoryJobs = clientJobs.filter((job) => job.category === category);
      const categoryContracts = clientContracts.filter((contract) => contract.category === category);
      const planned = categoryJobs.reduce((total, job) => total + (job.budgetMode === 'fixed' ? job.budgetMin : job.budgetMax), 0);
      const committed = sumAmounts(categoryContracts);

      return {
        category,
        planned,
        committed,
        remaining: Math.max(0, planned - committed),
        jobsCount: categoryJobs.length,
        contractsCount: categoryContracts.length,
      };
    })
    .sort((a, b) => b.planned - a.planned);
}

export function getCurrentWeekRange(referenceDate = new Date()): { start: Date; end: Date } {
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

export function shiftWeek(range: { start: Date; end: Date }, weeks: number): { start: Date; end: Date } {
  const start = new Date(range.start);
  const end = new Date(range.end);
  start.setDate(start.getDate() + weeks * 7);
  end.setDate(end.getDate() + weeks * 7);
  return { start, end };
}

export function formatWeekRange(range: { start: Date; end: Date }): string {
  return `${DATE_FORMATTER.format(range.start)} - ${DATE_FORMATTER.format(range.end)}`;
}

export function filterTransactionsByDateRange(
  transactions: FinanceTransaction[],
  range: { start: Date; end: Date }
): FinanceTransaction[] {
  return transactions.filter((transaction) => {
    const date = new Date(transaction.date);
    return date >= range.start && date <= range.end;
  });
}
