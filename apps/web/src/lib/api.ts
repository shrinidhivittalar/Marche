// Thin client for apps/api's Identity module (docs/module1.md). Every call
// sends credentials so the httpOnly refresh-token cookie set by /auth/login
// is included automatically — the access token is the only token this
// client ever sees or stores.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.message || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export type BackendRole = 'CLIENT' | 'PROVIDER' | 'ADMIN';

export interface BackendUser {
  id: string;
  email: string;
  name: string;
  role: BackendRole;
  emailVerified: boolean;
}

export function registerRequest(data: { email: string; password: string; name: string; role: 'CLIENT' | 'PROVIDER' }) {
  return apiFetch<BackendUser>('/auth/register', { method: 'POST', body: JSON.stringify(data) });
}

export function loginRequest(data: { email: string; password: string }) {
  return apiFetch<{ accessToken: string; user: BackendUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function refreshRequest() {
  return apiFetch<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
}

export function logoutRequest() {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}

export function meRequest(accessToken: string) {
  return apiFetch<BackendUser>('/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function forgotPasswordRequest(email: string) {
  return apiFetch<void>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

export function resetPasswordRequest(token: string, newPassword: string) {
  return apiFetch<void>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
}
