// Client for the admin/users endpoints — beside the other domain clients
// for the same reason as always. Both routes existed on the backend with
// no frontend caller at all until now (FEATURE_GAP_ANALYSIS.md #1).
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

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'DELETED';
export type PlatformRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export interface ApiAdminUser {
  id: string;
  email: string;
  name: string;
  role: 'CLIENT' | 'PROVIDER' | 'ADMIN';
  platformRole: PlatformRole;
  status: UserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export const adminApi = {
  listUsers: (
    token: string,
    page = 1,
    limit = 20,
    filters?: { status?: UserStatus; platformRole?: PlatformRole; search?: string },
  ) =>
    apiFetch<Envelope<ApiAdminUser>>(
      `/admin/users${toQuery({ page, limit, ...filters })}`,
      token,
    ).then(normalisePage),

  setStatus: (token: string, userId: string, status: UserStatus) =>
    apiFetch<{ changed: boolean; status: UserStatus }>(`/admin/users/${userId}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  setPlatformRole: (token: string, userId: string, platformRole: PlatformRole) =>
    apiFetch<{ changed: boolean; platformRole: PlatformRole }>(
      `/admin/users/${userId}/platform-role`,
      token,
      { method: 'PATCH', body: JSON.stringify({ platformRole }) },
    ),
};
