import React, { useState } from 'react';
import { Ban, RotateCcw, Search, UserCog } from 'lucide-react';
import { Badge, Button, Card, Input } from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { adminApi, type ApiAdminUser, type UserStatus } from '../../lib/admin-api';
import { ApiError } from '../../lib/api';
import { EmptyState } from '../../components/common/EmptyState';

const TABS: { label: string; status: UserStatus | undefined }[] = [
  { label: 'All', status: undefined },
  { label: 'Active', status: 'ACTIVE' },
  { label: 'Suspended', status: 'SUSPENDED' },
];

const STATUS_BADGE: Record<
  UserStatus,
  { label: string; variant: 'success' | 'destructive' | 'neutral' }
> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  SUSPENDED: { label: 'Suspended', variant: 'destructive' },
  DISABLED: { label: 'Disabled', variant: 'neutral' },
  DELETED: { label: 'Deleted', variant: 'neutral' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Closes the "identify a problematic user" half of FEATURE_GAP_ANALYSIS.md's
// #1 gap — suspend/restore already existed as an endpoint with no UI to
// reach it. Browsed newest-first, unlike Disputes' oldest-first backlog
// queue: this is a lookup tool, not a worklist.
export const AdminUsersPage: React.FC = () => {
  const { accessToken, currentUser } = useApp();
  const token = accessToken as string;

  const [statusFilter, setStatusFilter] = useState<UserStatus | undefined>(undefined);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const users = useApiResource(
    () => adminApi.listUsers(token, 1, 50, { status: statusFilter, search: search || undefined }),
    [token, statusFilter, search],
    { enabled: Boolean(token) },
  );

  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const items = users.data?.items ?? [];

  const toggleStatus = async (user: ApiAdminUser) => {
    setActioningId(user.id);
    setActionError(null);
    try {
      const next = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
      await adminApi.setStatus(token, user.id, next);
      await users.refetch();
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Unable to update this user.');
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Users</h1>
        <p className="text-xs text-ink-muted mt-1">
          Find a user and suspend or restore their account. Suspending blocks login and every
          state-changing action immediately.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 border-b border-border pb-3 sm:border-0 sm:pb-0">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => setStatusFilter(tab.status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === tab.status
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-surface text-ink-muted hover:text-ink border border-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <form
          className="flex-1 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <Input
            placeholder="Search by name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="outline" size="sm" icon={Search}>
            Search
          </Button>
        </form>
      </div>

      {actionError && <p className="text-xs text-danger">{actionError}</p>}

      {users.loading ? (
        <p className="text-xs text-ink-muted py-12 text-center">Loading users…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No users found"
          description="Nothing matches this filter."
          icon={UserCog}
        />
      ) : (
        <div className="space-y-3">
          {items.map((user) => {
            const badge = STATUS_BADGE[user.status];
            const isSelf = user.id === currentUser.id;
            return (
              <Card key={user.id} className="p-5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink">{user.name}</span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {user.platformRole !== 'USER' && (
                      <Badge variant="info">{user.platformRole.replace('_', ' ')}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted mt-0.5">{user.email}</p>
                  <p className="text-[11px] text-ink-muted mt-1">
                    {user.role} · Joined {formatDate(user.createdAt)}
                  </p>
                </div>

                {isSelf ? (
                  <span className="text-[11px] text-ink-muted">This is you</span>
                ) : (
                  <Button
                    size="sm"
                    variant={user.status === 'SUSPENDED' ? 'outline' : 'danger'}
                    icon={user.status === 'SUSPENDED' ? RotateCcw : Ban}
                    disabled={actioningId === user.id}
                    onClick={() => toggleStatus(user)}
                  >
                    {actioningId === user.id
                      ? 'Working…'
                      : user.status === 'SUSPENDED'
                        ? 'Restore'
                        : 'Suspend'}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
