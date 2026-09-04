// Client for the Proposals (Module 5) API.
//
// Beside jobs-api.ts for the same reason that one sits beside
// marketplace-api.ts: a proposal is the provider's answer to a requirement,
// and the two lifecycles are separate.
//
// Every call here takes a token. Nothing about a proposal is public — not
// the list, not a single one, not an attachment — which is the difference
// from jobs-api, where discovery is deliberately open.
import { apiFetch, toQuery } from './api-fetch';
import type { Page } from './marketplace-api';
import type { ApiJobAttachment, JobStatus } from './jobs-api';

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

// ---------------------------------------------------------------------------
// Types — mirror the API responses, not the frontend's mock model
// ---------------------------------------------------------------------------

export type ProposalStatus = 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

// The fields both sides of a proposal see. Prices arrive as strings from
// Prisma's Decimal and are kept as strings, formatted for display rather
// than parsed into a float that loses paise.
export interface ProposalCore {
  id: string;
  coverMessage: string;
  proposedPrice: string;
  /** The negotiated final figure, if the two parties agreed on one via
   * price-negotiations before hiring. Always agreedPrice ?? proposedPrice
   * for display/charging — see formatOffer in formatProposal.ts. */
  agreedPrice: string | null;
  agreedPriceAt: string | null;
  deliveryDays: number;
  status: ProposalStatus;
  submittedAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  withdrawnAt: string | null;
}

/** What the client reviewing their own requirement sees: who is offering. */
export interface ApiProposal extends ProposalCore {
  providerProfile: {
    id: string;
    username: string | null;
    displayName: string;
    headline: string | null;
    location: string | null;
    verifiedAt: string | null;
    avatarMediaId: string | null;
  };
}

/** What a provider sees on their own: the requirement it was made against. */
export interface ApiOwnProposal extends ProposalCore {
  job: {
    id: string;
    title: string;
    status: JobStatus;
    eventDate: string | null;
    /** Wall-clock "HH:MM" at the venue — display as given, never re-zone. */
    eventStartTime: string | null;
    eventEndTime: string | null;
    locationCoarse: string | null;
    /** Present, possibly null, only once GET /proposals/:id confirms you were hired for this job. */
    locationExact?: unknown;
    proposalDeadline: string | null;
    /** True for a direct-contracts-api.ts offer — accepted/declined there, not via accept/reject below. */
    isDirect: boolean;
    clientProfile: { id: string; username: string | null; displayName: string };
  };
}

// Identical to a requirement's attachment, because both come from the same
// media pipeline. Aliased rather than redeclared so the two cannot drift.
export type ApiProposalAttachment = ApiJobAttachment;

/**
 * The hiring relationship, created when a proposal is accepted.
 *
 * Both parties are on the row, so a screen renders "the other side" by
 * comparing against the caller's own profile id rather than needing two
 * different endpoints.
 */
export type ConnectionStatus = 'ACTIVE' | 'COMPLETED';

export interface ApiConnection {
  id: string;
  status: ConnectionStatus;
  completedAt: string | null;
  createdAt: string;
  job: {
    id: string;
    title: string;
    status: JobStatus;
    eventDate: string | null;
    locationCoarse: string | null;
    /** Present, possibly null, once GET /connections/:id confirms you are a party to this hire. */
    locationExact?: unknown;
    isDirect: boolean;
  };
  proposal: {
    id: string;
    proposedPrice: string;
    agreedPrice: string | null;
    agreedPriceAt: string | null;
    deliveryDays: number;
    submittedAt: string;
  };
  clientProfile: {
    id: string;
    username: string | null;
    displayName: string;
    location: string | null;
    avatarMediaId: string | null;
  };
  providerProfile: {
    id: string;
    username: string | null;
    displayName: string;
    headline: string | null;
    location: string | null;
    verifiedAt: string | null;
    avatarMediaId: string | null;
  };
}

/** One date on the provider's own availability calendar. */
export interface ApiCalendarEntry {
  date: string;
  status: 'PENDING' | 'CONFIRMED';
  jobId: string;
  jobTitle: string;
}

export type PriceNegotiationStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

// One round of "what if the price were X" on a proposal. Prices arrive as
// decimal strings, same reasoning as ApiProposal.proposedPrice. Both
// profiles are named on the row so a screen can render "who proposed this"
// without a second lookup — see price-negotiations.repository.ts's own
// NEGOTIATION_FIELDS, which this mirrors exactly.
export interface ApiPriceNegotiation {
  id: string;
  proposalId: string;
  amount: string;
  status: PriceNegotiationStatus;
  createdAt: string;
  respondedAt: string | null;
  proposedByProfileId: string;
  respondedByProfileId: string | null;
  proposedByProfile: { id: string; displayName: string };
  respondedByProfile: { id: string; displayName: string } | null;
}

export interface ProposalBody {
  jobId: string;
  coverMessage: string;
  proposedPrice: number;
  deliveryDays: number;
}

export const proposalsApi = {
  // ---------- provider ----------

  submit: (token: string, body: ProposalBody) =>
    apiFetch<{ id: string }>('/proposals', token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  mine: (token: string, page = 1, limit = 20) =>
    apiFetch<Envelope<ApiOwnProposal>>(`/proposals/me${toQuery({ page, limit })}`, token).then(
      normalisePage,
    ),

  /**
   * Final for that requirement — the provider cannot propose on it again.
   * The screen has to say so before calling this.
   */
  withdraw: (token: string, id: string) =>
    apiFetch<void>(`/proposals/${id}/withdraw`, token, { method: 'POST' }),

  // ---------- client ----------

  forJob: (token: string, jobId: string, page = 1, limit = 20) =>
    apiFetch<Envelope<ApiProposal>>(
      `/jobs/${jobId}/proposals${toQuery({ page, limit })}`,
      token,
    ).then(normalisePage),

  onJobById: (token: string, jobId: string, proposalId: string) =>
    apiFetch<ApiProposal>(`/jobs/${jobId}/proposals/${proposalId}`, token),

  /** Returns the connection: the requirement is now filled and the rest rejected. */
  accept: (token: string, id: string) =>
    apiFetch<ApiConnection>(`/proposals/${id}/accept`, token, { method: 'POST' }),

  reject: (token: string, id: string) =>
    apiFetch<void>(`/proposals/${id}/reject`, token, { method: 'POST' }),

  // ---------- either party ----------

  // Shape depends on who is asking: a provider gets their own view with the
  // requirement attached, a client gets the provider's identity.
  byId: <T extends ApiProposal | ApiOwnProposal>(token: string, id: string) =>
    apiFetch<T>(`/proposals/${id}`, token),

  attachments: (token: string, proposalId: string) =>
    apiFetch<ApiProposalAttachment[]>(`/proposals/${proposalId}/attachments`, token),

  addAttachment: (token: string, proposalId: string, mediaId: string) =>
    apiFetch<{ id: string; mediaId: string; displayOrder: number }>(
      `/proposals/${proposalId}/attachments`,
      token,
      { method: 'POST', body: JSON.stringify({ mediaId }) },
    ),

  removeAttachment: (token: string, proposalId: string, attachmentId: string) =>
    apiFetch<void>(`/proposals/${proposalId}/attachments/${attachmentId}`, token, {
      method: 'DELETE',
    }),
};

// Negotiated commercial terms on one proposal — either party may propose,
// and only the party who did NOT propose a round may accept/reject it.
// Kept as its own export (not folded into proposalsApi) since it's a
// distinct sub-resource under /proposals/:id/price-negotiations, matching
// the backend's own separate controller.
export const priceNegotiationsApi = {
  list: (token: string, proposalId: string) =>
    apiFetch<ApiPriceNegotiation[]>(`/proposals/${proposalId}/price-negotiations`, token),

  propose: (token: string, proposalId: string, amount: number) =>
    apiFetch<ApiPriceNegotiation>(`/proposals/${proposalId}/price-negotiations`, token, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

  accept: (token: string, proposalId: string, negotiationId: string) =>
    apiFetch<ApiPriceNegotiation>(
      `/proposals/${proposalId}/price-negotiations/${negotiationId}/accept`,
      token,
      { method: 'POST' },
    ),

  reject: (token: string, proposalId: string, negotiationId: string) =>
    apiFetch<ApiPriceNegotiation>(
      `/proposals/${proposalId}/price-negotiations/${negotiationId}/reject`,
      token,
      { method: 'POST' },
    ),

  withdraw: (token: string, proposalId: string, negotiationId: string) =>
    apiFetch<ApiPriceNegotiation>(
      `/proposals/${proposalId}/price-negotiations/${negotiationId}/withdraw`,
      token,
      { method: 'POST' },
    ),
};

export const connectionsApi = {
  mine: (token: string, page = 1, limit = 20) =>
    apiFetch<Envelope<ApiConnection>>(`/connections/me${toQuery({ page, limit })}`, token).then(
      normalisePage,
    ),

  byId: (token: string, id: string) => apiFetch<ApiConnection>(`/connections/${id}`, token),

  /** Client-only, idempotent, only allowed once the job's eventDate has passed. */
  complete: (token: string, id: string) =>
    apiFetch<ApiConnection>(`/connections/${id}/complete`, token, { method: 'PATCH' }),

  /** Provider-only. Dates from submitted proposals and active connections combined. */
  myCalendar: (token: string) => apiFetch<ApiCalendarEntry[]>('/connections/me/calendar', token),
};
