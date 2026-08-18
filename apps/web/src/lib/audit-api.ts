// Client for the audit log read side (Admin only). Beside the other domain
// clients for the same reason as always: its own lifecycle, its own file.
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

export interface ApiAuditLog {
  id: string;
  eventType: string;
  userId: string | null;
  email: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export const auditApi = {
  list: (token: string, page = 1, limit = 20, search?: string) =>
    apiFetch<Envelope<ApiAuditLog>>(`/audit-logs${toQuery({ page, limit, search })}`, token).then(
      normalisePage,
    ),
};
