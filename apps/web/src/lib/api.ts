// Thin client for apps/api's Identity module (docs/module1.md). Every call
// sends credentials so the httpOnly refresh-token cookie set by /auth/login
// is included automatically — the access token is the only token this
// client ever sees or stores.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
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

// Resolves for an address that is already registered exactly as it does for a
// new one — the API deliberately does not say which it was, so that the sign-up
// form cannot be used to test whether an email has an account. There is no user
// in the response for the same reason.
export function registerRequest(data: {
  email: string;
  password: string;
  name: string;
  role: 'CLIENT' | 'PROVIDER';
}) {
  return apiFetch<{ status: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function loginRequest(data: { email: string; password: string }) {
  return apiFetch<{ accessToken: string; user: BackendUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Mirrors /auth/login's shape when Google's token already confirms the
// email; matches /auth/register's acknowledgement shape on the rarer path
// where it doesn't and the backend falls back to the same verification-email
// flow (see AuthService.googleLogin) — never both fields at once.
export function googleLoginRequest(idToken: string) {
  return apiFetch<{ accessToken: string; user: BackendUser } | { status: string }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
}

// Attaches a Google account to the caller's own already-authenticated
// account (POST /auth/google/link). Distinct from googleLoginRequest above,
// which signs in/registers — this never creates a session, it only links.
export function linkGoogleRequest(accessToken: string, idToken: string) {
  return apiFetch<{ linked: true }>('/auth/google/link', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ idToken }),
  });
}

// Concurrent refreshes share one request, and this is not an optimisation.
// Refresh tokens are single-use and rotating: the server revokes the old
// session on every refresh. Two calls with the same cookie therefore mean
// the first rotates it and the second arrives holding a revoked token and
// gets a 401 — silently signing the user out.
//
// That is reachable in normal use. React StrictMode double-invokes the
// mount effect in development, and outside that any two components or tabs
// refreshing at once collide the same way. De-duplicating here rather than
// at the call site keeps the guarantee wherever the refresh comes from.
let inFlightRefresh: Promise<{ accessToken: string }> | null = null;

export function refreshRequest() {
  if (!inFlightRefresh) {
    inFlightRefresh = apiFetch<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
    }).finally(() => {
      // Cleared once settled so a later refresh — after this token has been
      // used and rotated — issues a fresh request rather than replaying a
      // stale resolved promise.
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
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
  return apiFetch<void>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPasswordRequest(token: string, newPassword: string) {
  return apiFetch<void>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export function verifyEmailRequest(token: string) {
  return apiFetch<void>(`/auth/verify-email?token=${encodeURIComponent(token)}`, { method: 'GET' });
}
