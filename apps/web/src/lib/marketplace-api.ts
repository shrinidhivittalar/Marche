// Clients for the Profiles (Module 2) and Marketplace (Module 3) APIs.
//
// Kept separate from lib/api.ts, which is the Identity client: that one is
// about tokens and sessions, this one is about domain data. They share the
// same error type, and the same fetch helper — now in api-fetch.ts, where
// every domain client reads it from one definition.
import { apiFetch } from './api-fetch';

// ---------------------------------------------------------------------------
// Pagination
//
// The two modules return different envelopes — Profiles was built first with
// { items, total, page, limit } and Marketplace's spec required the richer
// { data, pagination: {...} }. This is recorded as known debt in module3.md.
// Both are normalised here so no screen has to care which module it is
// talking to.
// ---------------------------------------------------------------------------
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

type ProfilesEnvelope<T> = { items: T[]; total: number; page: number; limit: number };
type MarketplaceEnvelope<T> = {
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

function normalisePage<T>(res: ProfilesEnvelope<T> | MarketplaceEnvelope<T>): Page<T> {
  if ('pagination' in res) {
    return { items: res.data, ...res.pagination };
  }
  const totalPages = Math.ceil(res.total / res.limit);
  return {
    items: res.items,
    total: res.total,
    page: res.page,
    limit: res.limit,
    totalPages,
    hasNext: res.page < totalPages,
    hasPrevious: res.page > 1,
  };
}

// ---------------------------------------------------------------------------
// Types — mirror the API responses, not the frontend's mock model
// ---------------------------------------------------------------------------
export type Visibility = 'PUBLIC' | 'PRIVATE';
export type AvailabilityStatus = 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE';
export type LanguageProficiency = 'BASIC' | 'CONVERSATIONAL' | 'FLUENT' | 'NATIVE';
export type ServiceStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
export type ServiceSort = 'newest' | 'price_low' | 'price_high';

export interface ApiProfile {
  id: string;
  userId: string;
  username: string | null;
  displayName: string;
  headline: string | null;
  bio: string | null;
  /** Signed and short-lived, generated per read. Never send this back. */
  avatar: string | null;
  /** What a save actually sets. Null removes the picture. */
  avatarMediaId: string | null;
  location: string | null;
  timezone: string | null;
  visibility: Visibility;
  availabilityStatus: AvailabilityStatus;
  nextAvailableDate: string | null;
  verifiedAt: string | null;
  skills?: { id: string; skill: { id: string; name: string } }[];
  experiences?: ApiExperience[];
  educations?: ApiEducation[];
  certifications?: ApiCertification[];
  languages?: ApiLanguage[];
  portfolioItems?: ApiPortfolio[];
}

export interface ApiExperience {
  id: string;
  company: string;
  position: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  currentlyWorking: boolean;
}

export interface ApiEducation {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  graduationYear: number | null;
}

export interface ApiCertification {
  id: string;
  name: string;
  issuingOrganization: string;
  issueDate: string | null;
  expiryDate: string | null;
}

export interface ApiLanguage {
  id: string;
  language: string;
  proficiency: LanguageProficiency;
}

export interface ApiPortfolio {
  id: string;
  title: string;
  description: string;
  category: string | null;
  coverImage: string | null;
  projectDate: string | null;
  // Signed at read time from the stored file; null when the media was
  // deleted or never finished uploading.
  images?: { id: string; url: string | null }[];
}

export interface ApiSkill {
  id: string;
  name: string;
}

export interface ApiCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  parentId: string | null;
  displayOrder: number;
  children?: ApiCategory[];
}

export interface ApiServiceCard {
  id: string;
  title: string;
  description?: string;
  startingPrice: string;
  deliveryDays: number;
  tags: string[];
  createdAt: string;
  category: { id: string; name: string; slug: string };
  profile: {
    id: string;
    username: string | null;
    displayName: string;
    headline: string | null;
    avatar: string | null;
    location: string | null;
    availabilityStatus: AvailabilityStatus;
    verifiedAt: string | null;
  };
  skills: { skill: { id: string; name: string } }[];
  status?: ServiceStatus;
  // `id` identifies the attachment (what a delete targets); `mediaId`
  // identifies the underlying file (what an upload returns). The two are
  // not interchangeable.
  images?: { id: string; mediaId: string; sortOrder: number; url: string | null }[];
}

export interface ApiProviderCard {
  id: string;
  username: string | null;
  displayName: string;
  headline: string | null;
  avatar: string | null;
  location: string | null;
  availabilityStatus: AvailabilityStatus;
  verifiedAt: string | null;
  startingFrom: string | null;
  latestListingAt: string | null;
}

// ---------------------------------------------------------------------------
// Profiles (Module 2)
// ---------------------------------------------------------------------------
export const profilesApi = {
  me: (token: string) => apiFetch<ApiProfile>('/profiles/me', token),

  updateMe: (
    token: string,
    body: Partial<
      Pick<
        ApiProfile,
        | 'displayName'
        | 'headline'
        | 'bio'
        | 'avatarMediaId'
        | 'location'
        | 'timezone'
        | 'username'
        | 'visibility'
      >
    >,
  ) => apiFetch<ApiProfile>('/profiles/me', token, { method: 'PATCH', body: JSON.stringify(body) }),

  byId: (token: string, id: string) => apiFetch<ApiProfile>(`/profiles/${id}`, token),
  byUsername: (username: string) =>
    apiFetch<ApiProfile>(`/u/${encodeURIComponent(username)}`, null),

  updateAvailability: (
    token: string,
    body: { availabilityStatus: AvailabilityStatus; nextAvailableDate?: string | null },
  ) =>
    apiFetch<ApiProfile>('/availability', token, { method: 'PATCH', body: JSON.stringify(body) }),

  listSkills: (token: string | null, page = 1, limit = 100) =>
    apiFetch<ProfilesEnvelope<ApiSkill>>(`/skills?page=${page}&limit=${limit}`, token).then(
      normalisePage,
    ),
  addSkill: (token: string, skillId: string) =>
    apiFetch<unknown>('/skills', token, { method: 'POST', body: JSON.stringify({ skillId }) }),
  removeSkill: (token: string, userSkillId: string) =>
    apiFetch<void>(`/skills/${userSkillId}`, token, { method: 'DELETE' }),

  addExperience: (token: string, body: Record<string, unknown>) =>
    apiFetch<ApiExperience>('/experience', token, { method: 'POST', body: JSON.stringify(body) }),
  updateExperience: (token: string, id: string, body: Record<string, unknown>) =>
    apiFetch<ApiExperience>(`/experience/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  removeExperience: (token: string, id: string) =>
    apiFetch<void>(`/experience/${id}`, token, { method: 'DELETE' }),

  addEducation: (token: string, body: Record<string, unknown>) =>
    apiFetch<ApiEducation>('/education', token, { method: 'POST', body: JSON.stringify(body) }),
  removeEducation: (token: string, id: string) =>
    apiFetch<void>(`/education/${id}`, token, { method: 'DELETE' }),

  addCertification: (token: string, body: Record<string, unknown>) =>
    apiFetch<ApiCertification>('/certification', token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeCertification: (token: string, id: string) =>
    apiFetch<void>(`/certification/${id}`, token, { method: 'DELETE' }),

  addLanguage: (token: string, body: { language: string; proficiency: LanguageProficiency }) =>
    apiFetch<ApiLanguage>('/languages', token, { method: 'POST', body: JSON.stringify(body) }),
  removeLanguage: (token: string, id: string) =>
    apiFetch<void>(`/languages/${id}`, token, { method: 'DELETE' }),

  addPortfolio: (token: string, body: Record<string, unknown>) =>
    apiFetch<ApiPortfolio>('/portfolio', token, { method: 'POST', body: JSON.stringify(body) }),
  removePortfolio: (token: string, id: string) =>
    apiFetch<void>(`/portfolio/${id}`, token, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Marketplace (Module 3)
// ---------------------------------------------------------------------------
export interface ServiceSearchParams {
  q?: string;
  category?: string;
  skills?: string[];
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  availability?: AvailabilityStatus;
  sort?: ServiceSort;
  page?: number;
  limit?: number;
}

// Empty strings are dropped rather than sent. An empty `category=` would be
// rejected as an unknown category, and an empty `sort=` fails the enum check
// — both turn a cleared filter into a 400 instead of a wider search.
function toQuery(params: ServiceSearchParams): string {
  const q = new URLSearchParams();
  if (params.q?.trim()) q.set('q', params.q.trim());
  if (params.category) q.set('category', params.category);
  if (params.skills?.length) q.set('skills', params.skills.join(','));
  if (params.location?.trim()) q.set('location', params.location.trim());
  if (params.minPrice !== undefined) q.set('minPrice', String(params.minPrice));
  if (params.maxPrice !== undefined) q.set('maxPrice', String(params.maxPrice));
  if (params.availability) q.set('availability', params.availability);
  if (params.sort) q.set('sort', params.sort);
  q.set('page', String(params.page ?? 1));
  q.set('limit', String(params.limit ?? 20));
  return q.toString();
}

export const marketplaceApi = {
  categories: () => apiFetch<ApiCategory[]>('/categories', null),
  categoryBySlug: (slug: string) => apiFetch<ApiCategory>(`/categories/${slug}`, null),

  searchServices: (params: ServiceSearchParams) =>
    apiFetch<MarketplaceEnvelope<ApiServiceCard>>(`/services?${toQuery(params)}`, null).then(
      normalisePage,
    ),

  searchProviders: (params: ServiceSearchParams) =>
    apiFetch<MarketplaceEnvelope<ApiProviderCard>>(
      `/marketplace/providers?${toQuery(params)}`,
      null,
    ).then(normalisePage),

  serviceById: (id: string) => apiFetch<ApiServiceCard>(`/services/${id}`, null),

  myServices: (token: string, page = 1, limit = 20) =>
    apiFetch<MarketplaceEnvelope<ApiServiceCard>>(
      `/services/me?page=${page}&limit=${limit}`,
      token,
    ).then(normalisePage),

  createService: (
    token: string,
    body: {
      title: string;
      description: string;
      categoryId: string;
      startingPrice: number;
      deliveryDays: number;
      tags?: string[];
      skillIds?: string[];
    },
  ) => apiFetch<ApiServiceCard>('/services', token, { method: 'POST', body: JSON.stringify(body) }),

  updateService: (token: string, id: string, body: Record<string, unknown>) =>
    apiFetch<ApiServiceCard>(`/services/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  setServiceVisibility: (token: string, id: string, status: 'PUBLISHED' | 'UNPUBLISHED') =>
    apiFetch<ApiServiceCard>(`/services/${id}/visibility`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  deleteService: (token: string, id: string) =>
    apiFetch<void>(`/services/${id}`, token, { method: 'DELETE' }),

  // Images are attached one call at a time rather than as part of the
  // service body: the file is already uploaded by the time it is attached,
  // so there is nothing to batch.
  addServiceImage: (token: string, serviceId: string, mediaId: string) =>
    apiFetch<{ id: string; mediaId: string; sortOrder: number }>(
      `/services/${serviceId}/images`,
      token,
      { method: 'POST', body: JSON.stringify({ mediaId }) },
    ),

  removeServiceImage: (token: string, serviceId: string, imageId: string) =>
    apiFetch<void>(`/services/${serviceId}/images/${imageId}`, token, { method: 'DELETE' }),
};
