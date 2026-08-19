// Client for Direct Contracts. Its own file rather than folded into
// proposals-api.ts or jobs-api.ts — it's a client-only write with a
// distinct shape (provider + terms in one call), even though what it
// produces underneath is an ordinary Connection.
import { apiFetch } from './api-fetch';
import type { ApiConnection } from './proposals-api';

export interface CreateDirectContractBody {
  providerProfileId: string;
  categoryId: string;
  title: string;
  description: string;
  price: number;
  deliveryDays: number;
  eventDate?: string;
  location?: string;
}

export const directContractsApi = {
  create: (token: string, body: CreateDirectContractBody) =>
    apiFetch<ApiConnection>('/direct-contracts', token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
