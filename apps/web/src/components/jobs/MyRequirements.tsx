import React, { useState } from 'react';
import { Calendar, MapPin, Pencil, Plus, Search, Trash2, Ban, Users } from 'lucide-react';
import { Button, Card, Input } from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { ApiError } from '../../lib/api';
import { jobsApi, type ApiJob, type JobStatus } from '../../lib/jobs-api';
import { formatJobBudget, formatEventWhen, postedAgo } from '../../lib/formatJob';
import { EmptyState } from '../common/EmptyState';

// A client's own requirements, from GET /jobs/me.
//
// Replaces the mock list that stood here. One of that list's controls is
// deliberately absent rather than reimplemented:
//
// - Pause / resume. The lifecycle is DRAFT -> PUBLISHED -> FILLED with
//   CANCELLED reachable from the first two, and a paused state would
//   reopen a decision already made and tested. Cancelling is the way to
//   stop receiving proposals.
//
// Everything else survives with real data behind it: filter by state,
// search, resume a draft, cancel a published requirement, delete a draft.

const PAGE_SIZE = 20;

const FILTERS: { label: string; match: (status: JobStatus) => boolean }[] = [
  { label: 'All', match: () => true },
  { label: 'Drafts', match: (s) => s === 'DRAFT' },
  { label: 'Published', match: (s) => s === 'PUBLISHED' },
  { label: 'Filled', match: (s) => s === 'FILLED' },
  { label: 'Cancelled', match: (s) => s === 'CANCELLED' },
];

const STATUS_STYLE: Record<JobStatus, string> = {
  DRAFT: 'bg-surface-subtle text-ink-muted border-border',
  PUBLISHED: 'bg-surface-subtle text-ink-muted border-border',
  FILLED: 'bg-primary-subtle text-primary border-primary/20',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const MyRequirements: React.FC = () => {
  const { navigate, accessToken } = useApp();
  const token = accessToken as string;

  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requirements = useApiResource(() => jobsApi.mine(token, page, PAGE_SIZE), [token, page], {
    enabled: Boolean(token),
  });

  const run = async (id: string, action: () => Promise<unknown>) => {
    setError(null);
    setBusyId(id);
    try {
      await action();
      // Awaited, so the list never disagrees with what was just clicked.
      await requirements.refetch();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "That couldn't be saved. Check your connection and try again.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const all = requirements.data?.items ?? [];
  const active = FILTERS.find((f) => f.label === filter) ?? FILTERS[0];

  // Filtering and search are applied to the page in hand rather than sent to
  // the server: /jobs/me takes no filters, and a client's own list is short
  // enough that paging through it is the honest behaviour.
  const visible = all.filter(
    (job) =>
      (active?.match(job.status) ?? true) &&
      (search.trim() === '' || job.title.toLowerCase().includes(search.trim().toLowerCase())),
  );

  const countFor = (label: string) => {
    const f = FILTERS.find((x) => x.label === label);
    return all.filter((job) => f?.match(job.status) ?? true).length;
  };

  return (
    <div className="space-y-4" data-testid="my-requirements">
      <div className="space-y-4 bg-surface p-4 border border-border rounded-2xl shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map(({ label }) => (
            <button
              key={label}
              onClick={() => setFilter(label)}
              data-testid={`requirements-filter-${label.toLowerCase()}`}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                filter === label
                  ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                  : 'bg-bg text-ink-muted hover:text-ink border border-border'
              }`}
            >
              {label} ({countFor(label)})
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400 pointer-events-none" />
          <Input
            type="text"
            placeholder="Search your requirements by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="requirements-search"
            className="w-full bg-search-pill border-none rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500"
          />
        </div>
      </div>

      {error && (
        <p
          className="text-xs text-destructive font-medium"
          role="alert"
          data-testid="requirements-error"
        >
          {error}
        </p>
      )}

      {requirements.loading && all.length === 0 ? (
        <p className="text-xs text-ink-muted py-8 text-center">Loading your requirements…</p>
      ) : requirements.error ? (
        <EmptyState
          title="Your requirements could not be loaded"
          description={requirements.error}
          actionLabel="Try again"
          onAction={() => void requirements.refetch()}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? 'No requirements yet' : 'Nothing matches that filter'}
          description={
            all.length === 0
              ? 'Post what you need and providers will send you proposals.'
              : 'Try another tab or clear your search.'
          }
          actionLabel={all.length === 0 ? 'Post a requirement' : undefined}
          onAction={all.length === 0 ? () => navigate('/client/jobs/new') : undefined}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((job) => (
            <RequirementRow
              key={job.id}
              job={job}
              busy={busyId === job.id}
              onOpen={() => navigate(`/client/jobs/${job.id}`)}
              onEdit={() => navigate(`/client/jobs/new/manual/${job.id}`)}
              onPublish={() => void run(job.id, () => jobsApi.publish(token, job.id))}
              onCancel={() => void run(job.id, () => jobsApi.cancel(token, job.id))}
              onDelete={() => void run(job.id, () => jobsApi.remove(token, job.id))}
            />
          ))}
        </div>
      )}

      {(requirements.data?.totalPages ?? 0) > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            disabled={!requirements.data?.hasPrevious}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-ink disabled:opacity-40 cursor-pointer"
          >
            Previous
          </button>
          <span className="text-xs text-ink-muted">
            Page {requirements.data?.page} of {requirements.data?.totalPages}
          </span>
          <button
            type="button"
            disabled={!requirements.data?.hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-ink disabled:opacity-40 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

function RequirementRow({
  job,
  busy,
  onOpen,
  onEdit,
  onPublish,
  onCancel,
  onDelete,
}: {
  job: ApiJob;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const when = formatEventWhen(job);

  return (
    <Card className="p-5 space-y-3" data-testid="requirement-row" data-status={job.status}>
      <div className="flex items-start justify-between gap-3">
        <button onClick={onOpen} className="text-left min-w-0 cursor-pointer">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLE[job.status]}`}
            >
              {job.status}
            </span>
            <span className="text-[11px] text-ink-muted">
              {job.publishedAt ? postedAgo(job.publishedAt) : 'Not published'}
            </span>
          </div>
          <h3 className="text-sm font-bold text-ink break-words">{job.title}</h3>
        </button>

        <span className="text-xs font-semibold text-primary shrink-0">{formatJobBudget(job)}</span>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-ink-muted flex-wrap">
        <span>{job.category.name}</span>
        {(job.status === 'PUBLISHED' || job.status === 'FILLED') && (
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {job.proposalCount} proposal{job.proposalCount === 1 ? '' : 's'}
          </span>
        )}
        {job.locationCoarse && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {job.locationCoarse}
          </span>
        )}
        {when && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {when}
          </span>
        )}
      </div>

      {/* Only the actions the API allows from this state. A filled or
          cancelled requirement is history and offers none. */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        {job.status === 'DRAFT' && (
          <>
            <Button
              size="sm"
              icon={Plus}
              disabled={busy}
              onClick={onPublish}
              data-testid="requirement-publish"
            >
              {busy ? 'Working…' : 'Publish'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={Pencil}
              disabled={busy}
              onClick={onEdit}
              data-testid="requirement-edit"
            >
              Continue editing
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              disabled={busy}
              onClick={onDelete}
              data-testid="requirement-delete"
            >
              Delete
            </Button>
          </>
        )}

        {job.status === 'PUBLISHED' && (
          <>
            <Button
              size="sm"
              variant="outline"
              icon={Pencil}
              disabled={busy}
              onClick={onEdit}
              data-testid="requirement-edit"
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={Ban}
              disabled={busy}
              onClick={onCancel}
              data-testid="requirement-cancel"
            >
              {busy ? 'Working…' : 'Cancel'}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
