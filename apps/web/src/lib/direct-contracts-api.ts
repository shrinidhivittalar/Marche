// Client for Direct Contracts. Its own file rather than folded into
// proposals-api.ts or jobs-api.ts — it's a client-only write with a
// distinct shape (provider + terms in one call), even though what it
// produces underneath is an ordinary Proposal, pending the named
// provider's own accept/decline.
import { apiFetch } from './api-fetch';
import type { ApiConnection, ProposalCore } from './proposals-api';
import type { ServiceMode } from './category-templates-api';

export interface CreateDirectContractBody {
  providerProfileId: string;
  categoryId: string;
  title: string;
  description: string;
  price: number;
  deliveryDays: number;
  eventDate?: string;
  locationCoarse?: string;
  // Same rules as an ordinary Job's serviceMode/categoryData — see
  // create-direct-contract.dto.ts's own comment. Omitted entirely for a
  // category with no active template, same as CreateJobPage does.
  serviceMode?: ServiceMode;
  categoryData?: Record<string, unknown>;
}

export const directContractsApi = {
  /** Sends the offer. Nothing is binding until the provider accepts it below. */
  create: (token: string, body: CreateDirectContractBody) =>
    apiFetch<ProposalCore>('/direct-contracts', token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Provider-only. Returns the resulting connection. */
  accept: (token: string, proposalId: string) =>
    apiFetch<ApiConnection>(`/direct-contracts/${proposalId}/accept`, token, { method: 'POST' }),

  /** Provider-only. */
  decline: (token: string, proposalId: string) =>
    apiFetch<void>(`/direct-contracts/${proposalId}/decline`, token, { method: 'POST' }),
};
