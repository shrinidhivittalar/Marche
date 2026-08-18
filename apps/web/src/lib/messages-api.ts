// Client for the Messages (Module 5) API.
//
// Beside proposals-api.ts for the same reason every domain client sits next
// to the ones before it: its own lifecycle, its own file. A message only
// ever exists on a Connection (see proposals-api.ts's connectionsApi), so
// every route here is scoped to one.
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

export interface ApiMessage {
  id: string;
  connectionId: string;
  senderUserId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

/** One row per connection the caller is party to — what the conversation list renders. */
export interface ApiMessagePreview {
  connectionId: string;
  lastMessage: ApiMessage | null;
  unreadCount: number;
}

export const messagesApi = {
  forConnection: (token: string, connectionId: string, page = 1, limit = 50) =>
    apiFetch<Envelope<ApiMessage>>(
      `/connections/${connectionId}/messages${toQuery({ page, limit })}`,
      token,
    ).then(normalisePage),

  send: (token: string, connectionId: string, body: string) =>
    apiFetch<ApiMessage>(`/connections/${connectionId}/messages`, token, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  /** Marks the other party's messages on this connection read — never the caller's own. */
  markRead: (token: string, connectionId: string) =>
    apiFetch<void>(`/connections/${connectionId}/messages/read`, token, { method: 'PATCH' }),

  previews: (token: string) => apiFetch<ApiMessagePreview[]>('/messages/previews', token),

  unreadCount: (token: string) => apiFetch<{ count: number }>('/messages/unread-count', token),
};
