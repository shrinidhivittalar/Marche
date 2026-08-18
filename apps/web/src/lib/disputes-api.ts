// Client for Disputes. Beside the other domain clients for the same reason
// as always — a dispute only ever exists on a Connection.
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

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';

export interface ApiDispute {
  id: string;
  connectionId: string;
  raisedByUserId: string;
  raisedAgainstUserId: string;
  reason: string;
  evidence: string;
  status: DisputeStatus;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

export const disputesApi = {
  /** Either party on the connection, or an admin. */
  forConnection: (token: string, connectionId: string) =>
    apiFetch<ApiDispute[]>(`/connections/${connectionId}/disputes`, token),

  raise: (token: string, connectionId: string, reason: string, evidence: string) =>
    apiFetch<ApiDispute>(`/connections/${connectionId}/disputes`, token, {
      method: 'POST',
      body: JSON.stringify({ reason, evidence }),
    }),

  // ---------- admin ----------

  listAll: (token: string, page = 1, limit = 20, status?: DisputeStatus) =>
    apiFetch<Envelope<ApiDispute>>(`/disputes${toQuery({ page, limit, status })}`, token).then(
      normalisePage,
    ),

  resolve: (token: string, disputeId: string, resolution: string) =>
    apiFetch<ApiDispute>(`/disputes/${disputeId}/resolve`, token, {
      method: 'PATCH',
      body: JSON.stringify({ resolution }),
    }),
};
