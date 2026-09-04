import type { ProposalStatus } from './proposals-api';

// Display helpers for a proposal as the API returns it. Beside formatJob.ts
// for the same reason that exists: prices arrive as decimal strings so
// nothing rounds on the way in, and timestamps are ISO strings rather than
// the mock model's pre-formatted text.

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatOffer(proposal: {
  proposedPrice: string;
  agreedPrice?: string | null;
}): string {
  // Negotiated price wins once one exists — a proposal that's been through
  // price-negotiations should never display or charge the original figure.
  // Said plainly rather than shown as "₹0" — a free offer is a real thing a
  // provider may make, and it should read as deliberate.
  const value = Number(proposal.agreedPrice ?? proposal.proposedPrice);
  return value === 0 ? 'Free' : rupees.format(value);
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatSubmitted(proposal: { submittedAt: string }): string {
  return `Submitted ${dateFormat.format(new Date(proposal.submittedAt))}`;
}

export function formatTurnaround(proposal: { deliveryDays: number }): string {
  return `${proposal.deliveryDays} ${proposal.deliveryDays === 1 ? 'day' : 'days'}`;
}

// Wording is the same for both parties, because the fact is the same. Only
// WITHDRAWN could read differently depending on who withdrew, and
// "Withdrawn" is true either way.
export const PROPOSAL_STATUS_STYLE: Record<ProposalStatus, { label: string; className: string }> = {
  SUBMITTED: {
    label: 'Awaiting decision',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  ACCEPTED: {
    label: 'Accepted',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  REJECTED: {
    label: 'Not selected',
    className: 'bg-surface-subtle text-ink-muted border-border',
  },
  WITHDRAWN: {
    label: 'Withdrawn',
    className: 'bg-surface-subtle text-ink-muted border-border',
  },
};
