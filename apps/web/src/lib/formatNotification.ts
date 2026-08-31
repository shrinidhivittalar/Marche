import type { ApiNotification } from './notifications-api';
import type { ActiveMode } from './active-mode';

// Display helpers for a notification as the API returns it. Beside
// formatProposal.ts for the same reason that one exists: the API sends only
// ids in `data` (module6.md's rule against putting anything else there), so
// the deep link and the visual category are both derived here rather than
// carried on the wire.

export type NotificationCategory = 'proposal' | 'connection' | 'job' | 'payment';

export function notificationCategory(type: ApiNotification['type']): NotificationCategory {
  switch (type) {
    case 'PROPOSAL_SUBMITTED':
    case 'PROPOSAL_WITHDRAWN':
    case 'PROPOSAL_ACCEPTED':
    case 'PROPOSAL_REJECTED':
      return 'proposal';
    case 'CONNECTION_ESTABLISHED':
      return 'connection';
    case 'JOB_CANCELLED':
    case 'JOB_MATCHED':
      return 'job';
    case 'PAYMENT_RECEIVED':
      return 'payment';
  }
}

/**
 * Where clicking a notification should go, for the viewer currently reading
 * it. Returns null rather than a guess when `data` is missing the id it
 * needs — module6.md's "Malformed notification data": a notification must
 * still render, just without navigation, not crash.
 *
 * The route itself still enforces its own authorization on load — holding a
 * notification about something is never treated as proof of access to it.
 *
 * Takes the viewer's presentation mode rather than their legacy role. Only
 * one notification type actually branches on the viewer, but for a
 * dual-capability user the two answers differ: someone whose role is
 * 'vendor' reading in CLIENT mode was previously sent to the provider
 * route, which the mode-aware route gate then bounced. Mode is the value
 * that matches where they actually are. A viewer with no marketplace
 * surface (an admin) resolves to the client destination, exactly as a
 * non-'vendor' role did before.
 */
export function notificationRoute(
  notification: ApiNotification,
  viewerMode: ActiveMode | null,
): string | null {
  const { type, data } = notification;
  const proposalId = data?.proposalId;
  const jobId = data?.jobId;

  switch (type) {
    // Recipient is always the client who owns the requirement.
    case 'PROPOSAL_SUBMITTED':
    case 'PROPOSAL_WITHDRAWN':
      return proposalId ? `/client/proposals/${proposalId}` : null;

    // Recipient is always the provider who made the offer.
    case 'PROPOSAL_ACCEPTED':
    case 'PROPOSAL_REJECTED':
      return proposalId ? `/provider/proposals/${proposalId}` : null;

    // Recipient is whichever party is viewing — there is no shared
    // Connection page yet, so this lands on each side's own proposal view.
    case 'CONNECTION_ESTABLISHED':
      if (!proposalId) return null;
      return viewerMode === 'PROVIDER'
        ? `/provider/proposals/${proposalId}`
        : `/client/proposals/${proposalId}`;

    // Recipient is always a provider who had proposed.
    case 'JOB_CANCELLED':
      return jobId ? `/provider/jobs/${jobId}` : null;

    // Recipient is a provider with a matching service, not yet a proposer —
    // same destination, the public requirement they can now bid on.
    case 'JOB_MATCHED':
      return jobId ? `/provider/jobs/${jobId}` : null;

    // Recipient is always the provider who got paid.
    case 'PAYMENT_RECEIVED':
      return data?.connectionId ? `/contracts/${data.connectionId}` : null;

    default:
      return null;
  }
}

const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

// Time-only reads fine for something from an hour ago; it's ambiguous once
// the list has any real history — "14:32" alone doesn't say which day. Only
// today's notifications get the bare time; anything older gets a date.
export function formatNotificationTime(notification: ApiNotification): string {
  const createdAt = new Date(notification.createdAt);
  const isToday = createdAt.toDateString() === new Date().toDateString();
  return isToday ? timeFormat.format(createdAt) : dateFormat.format(createdAt);
}
