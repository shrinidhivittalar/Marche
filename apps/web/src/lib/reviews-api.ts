// Client for the Reviews (Module 5) API.
//
// Beside messages-api.ts and proposals-api.ts for the same reason every
// domain client sits next to the ones before it. A review only ever exists
// on a Connection (see proposals-api.ts's connectionsApi) or, read back, on
// the profile it was written about.
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

export interface ApiReview {
  id: string;
  connectionId: string;
  reviewerUserId: string;
  revieweeProfileId: string | null;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface ReviewStats {
  averageRating: number | null;
  reviewCount: number;
}

/** One entry in a client's "recent history" — a review they wrote about a past hire. */
export interface ApiClientHistoryEntry {
  jobId: string;
  jobTitle: string;
  providerDisplayName: string | null;
  rating: number;
  comment: string;
  createdAt: string;
}

export const reviewsApi = {
  /** Either party, once, only after the connection is COMPLETED. */
  submit: (token: string, connectionId: string, rating: number, comment: string) =>
    apiFetch<ApiReview>(`/connections/${connectionId}/reviews`, token, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }),

  /** The caller's own review on this connection, or null if they haven't written one yet. */
  mine: (token: string, connectionId: string) =>
    apiFetch<ApiReview | null>(`/connections/${connectionId}/reviews/me`, token),

  /** Public — a profile's visible reviews. A review not yet revealed (see the API) is simply absent. */
  forProfile: (profileId: string, page = 1, limit = 20) =>
    apiFetch<Envelope<ApiReview>>(
      `/profiles/${profileId}/reviews${toQuery({ page, limit })}`,
      null,
    ).then(normalisePage),

  statsForProfile: (profileId: string) =>
    apiFetch<ReviewStats>(`/profiles/${profileId}/reviews/stats`, null),

  /** Public — a client's own visible reviews of past hires, newest first. */
  clientHistory: (profileId: string, limit = 5) =>
    apiFetch<ApiClientHistoryEntry[]>(
      `/profiles/${profileId}/client-history${toQuery({ limit })}`,
      null,
    ),
};
