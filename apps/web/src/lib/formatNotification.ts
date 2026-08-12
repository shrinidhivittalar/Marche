import type { ApiNotification } from './notifications-api';
import type { UserRole } from '../types';

// Display helpers for a notification as the API returns it. Beside
// formatProposal.ts for the same reason that one exists: the API sends only
// ids in `data` (module6.md's rule against putting anything else there), so
// the deep link and the visual category are both derived here rather than
// carried on the wire.

export type NotificationCategory = 'proposal' | 'connection' | 'job';

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
      return 'job';
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
 */
export function notificationRoute(
  notification: ApiNotification,
  viewerRole: UserRole,
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
      return viewerRole === 'vendor'
        ? `/provider/proposals/${proposalId}`
        : `/client/proposals/${proposalId}`;

    // Recipient is always a provider who had proposed.
    case 'JOB_CANCELLED':
      return jobId ? `/provider/jobs/${jobId}` : null;

    default:
      return null;
  }
}

const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' });

export function formatNotificationTime(notification: ApiNotification): string {
  return timeFormat.format(new Date(notification.createdAt));
}
