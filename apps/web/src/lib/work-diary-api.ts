// Client for the Work Diary. Beside the other domain clients for the same
// reason as always — an entry only ever exists on a Connection.
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

export interface ApiWorkDiaryEntry {
  id: string;
  note: string;
  createdAt: string;
  authorUserId: string;
  author: { id: string; name: string };
}

export interface ApiWorkDiaryEntryWithConnection extends ApiWorkDiaryEntry {
  connection: {
    id: string;
    job: { id: string; title: string };
    clientProfile: { id: string; displayName: string };
    providerProfile: { id: string; displayName: string };
  };
}

export const workDiaryApi = {
  forConnection: (token: string, connectionId: string) =>
    apiFetch<ApiWorkDiaryEntry[]>(`/connections/${connectionId}/work-diary`, token),

  addEntry: (token: string, connectionId: string, note: string) =>
    apiFetch<ApiWorkDiaryEntry>(`/connections/${connectionId}/work-diary`, token, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  /** Every entry across every connection the caller is a party to. */
  mine: (token: string, page = 1, limit = 50) =>
    apiFetch<Envelope<ApiWorkDiaryEntryWithConnection>>(
      `/work-diary/me${toQuery({ page, limit })}`,
      token,
    ).then(normalisePage),
};
