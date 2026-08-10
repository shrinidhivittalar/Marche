// The shared fetch helper for every domain API client.
//
// Extracted when Proposals (Module 5) would have become the third identical
// copy — marketplace-api.ts and jobs-api.ts each had their own. One
// definition now, so a change to error handling or credential mode reaches
// every client rather than two of three.
//
// lib/api.ts keeps its own: that one is the Identity client and is about
// tokens and sessions rather than domain data, and it never takes a bearer
// token as an argument because it is what issues them.
import { ApiError } from './api';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function apiFetch<T>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const raw = body?.message ?? `Request failed with status ${res.status}`;
    // class-validator returns an array of messages; join them so a caller
    // can render one string without having to know which shape it got.
    throw new ApiError(res.status, Array.isArray(raw) ? raw.join(', ') : raw);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Empty values are dropped rather than sent as blank params: `?location=`
// would otherwise reach the API as a filter on the empty string.
export function toQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const serialised = query.toString();
  return serialised ? `?${serialised}` : '';
}
