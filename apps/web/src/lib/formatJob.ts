import type { ApiJob } from './jobs-api';

// Display helpers for a requirement as the API returns it.
//
// Separate from lib/formatBudget.ts, which formats the mock Job — that one
// takes numbers and a budgetMode, neither of which exists here. Budgets
// arrive as decimal strings so no rounding happens on the way in, and
// "fixed vs range" is read from the values rather than stored as a mode:
// budgetMin === budgetMax is what fixed means.

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function amount(value: string): string {
  return rupees.format(Number(value));
}

export function formatJobBudget(job: Pick<ApiJob, 'budgetMin' | 'budgetMax'>): string {
  const { budgetMin, budgetMax } = job;

  // Said plainly rather than shown as "₹0". A client who has not named a
  // figure is inviting a quote, and pretending otherwise misleads both
  // sides.
  if (!budgetMin && !budgetMax) return 'Budget not stated';

  if (budgetMin && budgetMax) {
    return Number(budgetMin) === Number(budgetMax)
      ? amount(budgetMin)
      : `${amount(budgetMin)} – ${amount(budgetMax)}`;
  }

  return budgetMin ? `From ${amount(budgetMin)}` : `Up to ${amount(budgetMax as string)}`;
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * The event date with its hours, or null when there is no date.
 *
 * Times are printed exactly as stored. They are wall-clock at the venue —
 * a 6pm ceremony is at 6pm for everyone in the room — so putting them
 * through a timezone conversion would move the event for the reader.
 */
export function formatEventWhen(
  job: Pick<ApiJob, 'eventDate' | 'eventStartTime' | 'eventEndTime'>,
): string | null {
  if (!job.eventDate) return null;

  const date = dateFormat.format(new Date(job.eventDate));
  if (!job.eventStartTime) return date;

  const hours = job.eventEndTime
    ? `${job.eventStartTime}–${job.eventEndTime}`
    : `from ${job.eventStartTime}`;
  return `${date}, ${hours}`;
}

export function formatDeadline(job: Pick<ApiJob, 'proposalDeadline'>): string | null {
  if (!job.proposalDeadline) return null;
  return dateFormat.format(new Date(job.proposalDeadline));
}

/** Whole days only — "3 hours ago" on a requirement board is false precision. */
export function postedAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  return `Posted ${days} days ago`;
}
