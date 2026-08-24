// Client for the Notifications (Module 6) API.
//
// Beside proposals-api.ts for the same reason that one sits beside
// jobs-api.ts: its own lifecycle, its own file. Notifications has no create
// endpoint on purpose — see module6.md's "Notification Authorization" — so
// this client only ever reads and marks read.
import { apiFetch, toQuery } from './api-fetch';
import type { Page } from './marketplace-api';

type Envelope<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
};

function normalisePage<T>(res: Envelope<T>): Page<T> {
  return { items: res.data, ...res.pagination };
}

export type NotificationType =
  | 'PROPOSAL_SUBMITTED'
  | 'PROPOSAL_WITHDRAWN'
  | 'PROPOSAL_ACCEPTED'
  | 'PROPOSAL_REJECTED'
  | 'CONNECTION_ESTABLISHED'
  | 'JOB_CANCELLED'
  | 'JOB_MATCHED'
  | 'PAYMENT_RECEIVED';

// Safe navigation metadata only — ids, never anything sensitive. See
// module6.md's "Important Rule". Which keys are present depends on `type`;
// nothing here should be trusted as a source of truth, only as a pointer to
// re-fetch the real resource (which re-checks its own authorization).
export interface NotificationData {
  jobId?: string;
  proposalId?: string;
  connectionId?: string;
}

export interface ApiNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: NotificationData | null;
  readAt: string | null;
  createdAt: string;
}

export const notificationsApi = {
  list: (token: string, page = 1, limit = 20) =>
    apiFetch<Envelope<ApiNotification>>(`/notifications${toQuery({ page, limit })}`, token).then(
      normalisePage,
    ),

  unreadCount: (token: string) => apiFetch<{ count: number }>('/notifications/unread-count', token),

  /** Idempotent — marking an already-read notification again is harmless. */
  markAsRead: (token: string, id: string) =>
    apiFetch<ApiNotification>(`/notifications/${id}/read`, token, { method: 'PATCH' }),

  markAllRead: (token: string) =>
    apiFetch<void>('/notifications/read-all', token, { method: 'PATCH' }),
};
