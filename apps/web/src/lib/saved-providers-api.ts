// Client for Saved Talent — a client bookmarking a provider's profile.
// Beside the other domain clients for the same reason as always.
import { apiFetch, toQuery } from './api-fetch';
import type { AvailabilityStatus, Page } from './marketplace-api';

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

// Narrower than ApiProviderCard: no startingFrom/latestListingAt, since
// those are aggregated from a search's matching services — a saved list
// isn't anchored to a search.
export interface ApiSavedProviderCard {
  id: string;
  username: string | null;
  displayName: string;
  headline: string | null;
  avatar: string | null;
  location: string | null;
  availabilityStatus: AvailabilityStatus;
  verifiedAt: string | null;
}

export const savedProvidersApi = {
  isSaved: (token: string, providerProfileId: string) =>
    apiFetch<{ saved: boolean }>(`/profiles/${providerProfileId}/save`, token),

  save: (token: string, providerProfileId: string) =>
    apiFetch<{ id: string }>(`/profiles/${providerProfileId}/save`, token, { method: 'POST' }),

  unsave: (token: string, providerProfileId: string) =>
    apiFetch<void>(`/profiles/${providerProfileId}/save`, token, { method: 'DELETE' }),

  mine: (token: string, page = 1, limit = 20) =>
    apiFetch<Envelope<ApiSavedProviderCard>>(
      `/saved-providers/me${toQuery({ page, limit })}`,
      token,
    ).then(normalisePage),
};
