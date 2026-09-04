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

// The plain create() response — WorkDiaryRepository.create returns the bare
// Prisma row with no `select`, so `author` genuinely isn't present here the
// way it is on every list read (WorkDiaryRepository.ENTRY_WITH_CONTEXT).
// Typed separately rather than reusing ApiWorkDiaryEntry so this shape never
// silently lies about having a relation it doesn't.
export interface ApiWorkDiaryEntryCreated {
  id: string;
  connectionId: string;
  authorUserId: string;
  note: string;
  createdAt: string;
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
    apiFetch<ApiWorkDiaryEntryCreated>(`/connections/${connectionId}/work-diary`, token, {
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
