// Client for Referrals — a client inviting someone they trust to join
// Marché. Beside the other domain clients for the same reason as always.
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

export type ReferralStatus = 'INVITED' | 'JOINED';

export interface ApiReferral {
  id: string;
  name: string;
  email: string;
  specialty: string;
  note: string | null;
  status: ReferralStatus;
  createdAt: string;
  joinedAt: string | null;
}

export interface CreateReferralBody {
  name: string;
  email: string;
  specialty: string;
  note?: string;
}

export const referralsApi = {
  mine: (token: string, page = 1, limit = 20) =>
    apiFetch<Envelope<ApiReferral>>(`/referrals/me${toQuery({ page, limit })}`, token).then(
      normalisePage,
    ),

  create: (token: string, body: CreateReferralBody) =>
    apiFetch<ApiReferral>('/referrals', token, { method: 'POST', body: JSON.stringify(body) }),
};
