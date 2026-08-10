// Client for the Jobs (Module 4) API.
//
// Kept beside marketplace-api.ts rather than inside it: that file is already
// two modules' worth of surface, and requirements are the other side of the
// marketplace — a client posting work rather than a provider listing it.
//
// The vocabulary split is deliberate and matches the backend. Types and
// paths say "job"; anything a person reads says "requirement".
import { apiFetch, toQuery } from './api-fetch';
import type { Page } from './marketplace-api';

// The API returns the marketplace envelope; normalised to the same Page
// shape every other screen already consumes.
type JobsEnvelope<T> = {
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

function normalisePage<T>(res: JobsEnvelope<T>): Page<T> {
  return { items: res.data, ...res.pagination };
}

// ---------------------------------------------------------------------------
// Types — mirror the API responses, not the frontend's mock model
// ---------------------------------------------------------------------------

// No PROPOSAL_ACTIVITY: whether a requirement has proposals is counted in
// Module 5, not stored as a state here.
export type JobStatus = 'DRAFT' | 'PUBLISHED' | 'FILLED' | 'CANCELLED';

export const JOB_SORTS = ['newest', 'event_date', 'budget_low', 'budget_high'] as const;
export type JobSort = (typeof JOB_SORTS)[number];

export interface ApiJob {
  id: string;
  title: string;
  description: string;
  // Decimals arrive as strings from Prisma, so they are kept as strings and
  // formatted for display rather than parsed into a float that loses paise.
  budgetMin: string | null;
  budgetMax: string | null;
  location: string | null;
  eventDate: string | null;
  /** Wall-clock "HH:MM" at the venue — display as given, never re-zone. */
  eventStartTime: string | null;
  eventEndTime: string | null;
  proposalDeadline: string | null;
  deliverables: string[];
  status: JobStatus;
  publishedAt: string | null;
  cancelledAt?: string | null;
  /**
   * How many proposals this requirement has received.
   *
   * Owner reads only — `/jobs/me` and `/jobs/me/:id`. Absent on the public
   * routes, because it is the client's own count of who replied and no part
   * of discovery needs it. Counted per request rather than stored, so it
   * cannot drift the way a cached column would.
   */
  proposalCount?: number;
  createdAt: string;
  category: { id: string; name: string; slug: string };
  clientProfile: {
    id: string;
    username: string | null;
    displayName: string;
    location: string | null;
    verifiedAt: string | null;
  };
}

export interface ApiJobAttachment {
  /** Identifies the attachment — what a detach targets. */
  id: string;
  /** Identifies the underlying file. The two are not interchangeable. */
  mediaId: string;
  displayOrder: number;
  fileName: string | null;
  mimeType: string | null;
  /** Signed and short-lived; null if the file never finished uploading. */
  url: string | null;
}

export interface JobSearchParams {
  q?: string;
  category?: string;
  location?: string;
  minBudget?: number;
  maxBudget?: number;
  eventFrom?: string;
  eventUntil?: string;
  sort?: JobSort;
  page?: number;
  limit?: number;
}

export interface JobBody {
  title: string;
  description: string;
  categoryId: string;
  budgetMin?: number;
  budgetMax?: number;
  location?: string;
  eventDate?: string;
  /** 24-hour "HH:MM". Both need an eventDate to belong to. */
  eventStartTime?: string;
  eventEndTime?: string;
  proposalDeadline?: string;
  deliverables?: string[];
}

export const jobsApi = {
  // ---------- provider discovery (public) ----------

  search: (params: JobSearchParams = {}) =>
    apiFetch<JobsEnvelope<ApiJob>>(`/jobs${toQuery({ ...params })}`, null).then(normalisePage),

  byId: (id: string) => apiFetch<ApiJob>(`/jobs/${id}`, null),

  // ---------- client ownership ----------

  mine: (token: string, page = 1, limit = 20) =>
    apiFetch<JobsEnvelope<ApiJob>>(`/jobs/me${toQuery({ page, limit })}`, token).then(
      normalisePage,
    ),

  mineById: (token: string, id: string) => apiFetch<ApiJob>(`/jobs/me/${id}`, token),

  create: (token: string, body: JobBody) =>
    apiFetch<ApiJob>('/jobs', token, { method: 'POST', body: JSON.stringify(body) }),

  update: (token: string, id: string, body: Partial<JobBody>) =>
    apiFetch<ApiJob>(`/jobs/${id}`, token, { method: 'PATCH', body: JSON.stringify(body) }),

  // Lifecycle changes are their own calls rather than a status field on
  // update, mirroring the API — there is no way to publish by PATCH.
  publish: (token: string, id: string) =>
    apiFetch<ApiJob>(`/jobs/${id}/publish`, token, { method: 'POST' }),

  cancel: (token: string, id: string) =>
    apiFetch<ApiJob>(`/jobs/${id}/cancel`, token, { method: 'POST' }),

  /** Drafts only. A published requirement is cancelled instead. */
  remove: (token: string, id: string) => apiFetch<void>(`/jobs/${id}`, token, { method: 'DELETE' }),

  // ---------- attachments ----------
  //
  // Reads are authenticated even though the requirement itself is public:
  // a guest can see what is being asked for, not download the files.

  attachments: (token: string, jobId: string) =>
    apiFetch<ApiJobAttachment[]>(`/jobs/${jobId}/attachments`, token),

  addAttachment: (token: string, jobId: string, mediaId: string) =>
    apiFetch<{ id: string; mediaId: string; displayOrder: number }>(
      `/jobs/${jobId}/attachments`,
      token,
      { method: 'POST', body: JSON.stringify({ mediaId }) },
    ),

  removeAttachment: (token: string, jobId: string, attachmentId: string) =>
    apiFetch<void>(`/jobs/${jobId}/attachments/${attachmentId}`, token, { method: 'DELETE' }),
};
