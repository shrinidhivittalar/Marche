import React from 'react';
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  MapPin,
  FileText,
  CheckCircle2,
  Send,
  Pencil,
  Ban,
  Inbox,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useApiResource } from '../../hooks/useApiResource';
import { ApiError } from '../../lib/api';
import { jobsApi, type JobStatus } from '../../lib/jobs-api';
import { proposalsApi } from '../../lib/proposals-api';
import { formatJobBudget, formatEventWhen, formatDeadline } from '../../lib/formatJob';
import { formatOffer, formatTurnaround } from '../../lib/formatProposal';
import { ProposalStatusBadge } from '../../components/proposals/ProposalStatusBadge';

// A client's own requirement, on the real Jobs API.
//
// Read through the owner route rather than the public one, so a draft or a
// cancelled requirement is still visible to the person who wrote it.
//
// Proposals are real as of Module 5 and render at the foot of the page, in
// their own component with their own request — see ProposalsOnRequirement.
//
// The contract and audit tabs are still gone. They rendered mock contracts
// and mock audit entries keyed by mock ids, and neither module exists.

const STATUS_COPY: Record<JobStatus, { label: string; className: string; hint: string }> = {
  DRAFT: {
    label: 'Draft',
    className: 'bg-surface-subtle text-ink-muted border-border',
    hint: 'Only you can see this. Publish it for providers to find.',
  },
  PUBLISHED: {
    label: 'Published',
    className: 'bg-surface-subtle text-ink-muted border-border',
    hint: 'Providers can find this and send you proposals.',
  },
  FILLED: {
    label: 'Filled',
    className: 'bg-primary-subtle text-primary border-primary/20',
    hint: 'You accepted a proposal. This is no longer in discovery.',
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    hint: 'Withdrawn from discovery. Kept here for your reference.',
  },
};

interface JobDetailPageProps {
  id: string;
}

export const JobDetailPage: React.FC<JobDetailPageProps> = ({ id }) => {
  const { navigate, goBack, accessToken } = useApp();
  const token = accessToken as string;

  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const job = useApiResource(() => jobsApi.mineById(token, id), [id, token], {
    enabled: Boolean(token),
  });

  const attachments = useApiResource(() => jobsApi.attachments(token, id), [id, token], {
    enabled: Boolean(token),
  });

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    setBusy(true);
    try {
      await action();
      // Awaited, so the status on screen never disagrees with the buttons
      // beside it.
      await job.refetch();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "That couldn't be saved. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (job.loading) {
    return <p className="text-xs text-ink-muted py-12 text-center">Loading requirement…</p>;
  }

  if (job.error || !job.data) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          title="Requirement not found"
          description={job.error ?? 'It does not exist, or it is not yours.'}
          actionLabel="Go Back"
          onAction={goBack}
        />
      </div>
    );
  }

  const requirement = job.data;
  const status = STATUS_COPY[requirement.status];
  const when = formatEventWhen(requirement);
  const deadline = formatDeadline(requirement);
  const files = attachments.data ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <span
          data-testid="job-status"
          data-status={requirement.status}
          className={`px-3 py-1 rounded-full border text-xs font-bold ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      <Card className="p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 border-b border-border pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-surface-subtle text-xs font-bold text-primary border border-border">
                {requirement.category.name}
              </span>
              <span className="text-xs font-mono text-ink-muted">
                Created {new Date(requirement.createdAt).toLocaleDateString()}
              </span>
            </div>

            <h1
              className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight"
              data-testid="job-title"
            >
              {requirement.title}
            </h1>
            <p className="text-xs text-ink-muted">{status.hint}</p>
          </div>

          <div className="bg-bg border border-border rounded-2xl p-4 text-right shrink-0">
            <span className="block text-[10px] font-mono uppercase text-ink-muted">Budget</span>
            <span className="text-xl font-bold text-primary">{formatJobBudget(requirement)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <Spec icon={Calendar} label="Event" value={when ?? 'No date set'} />
          <Spec
            icon={MapPin}
            label="Venue / City"
            // The owner's own read — the API already includes locationExact
            // when set, so show it in preference to the coarse label.
            value={
              (typeof requirement.locationExact === 'string' ? requirement.locationExact : null) ??
              requirement.locationCoarse ??
              'Not stated'
            }
          />
          <Spec icon={CalendarClock} label="Proposal Deadline" value={deadline ?? 'None'} />
          <Spec
            icon={Send}
            label="Published"
            value={
              requirement.publishedAt
                ? new Date(requirement.publishedAt).toLocaleDateString()
                : 'Not yet'
            }
          />
        </div>

        <div>
          <h3 className="text-xs font-mono uppercase font-bold text-primary mb-2">
            What you asked for
          </h3>
          <p className="text-xs text-ink leading-relaxed whitespace-pre-line bg-bg p-4 border border-border rounded-xl">
            {requirement.description}
          </p>
        </div>

        {requirement.deliverables.length > 0 && (
          <div>
            <h3 className="text-xs font-mono uppercase font-bold text-primary mb-3">
              Expected Deliverables
            </h3>
            <div className="space-y-2">
              {requirement.deliverables.map((deliverable) => (
                <div
                  key={deliverable}
                  className="p-3 bg-surface border border-border rounded-xl text-xs text-ink flex items-center gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <span>{deliverable}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-xs font-mono uppercase font-bold text-primary mb-3">
            Reference Documents
          </h3>
          {files.length === 0 ? (
            <p className="text-xs text-ink-muted">No documents attached.</p>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <a
                  key={file.id}
                  href={file.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className={`p-3 bg-surface border border-border rounded-xl text-xs text-ink flex items-center gap-2.5 ${
                    file.url ? 'hover:border-zinc-300 hover:shadow-xs transition-all' : 'opacity-60'
                  }`}
                >
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate flex-1">{file.fileName ?? 'Attachment'}</span>
                  {!file.url && <span className="text-ink-muted shrink-0">Unavailable</span>}
                </a>
              ))}
            </div>
          )}
        </div>

        {actionError && (
          <p
            className="text-xs text-destructive font-medium"
            role="alert"
            data-testid="job-action-error"
          >
            {actionError}
          </p>
        )}

        {/* Only the transitions the API actually allows from here. There is
            no button to FILLED: that follows from accepting a proposal, in
            Module 5. */}
        <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border">
          {requirement.status === 'DRAFT' && (
            <>
              <Button
                icon={Send}
                disabled={busy}
                data-testid="publish-requirement"
                onClick={() => void run(() => jobsApi.publish(token, requirement.id))}
              >
                {busy ? 'Working…' : 'Publish Requirement'}
              </Button>
              <Button
                variant="outline"
                icon={Pencil}
                disabled={busy}
                onClick={() => navigate(`/client/jobs/new/manual/${requirement.id}`)}
              >
                Continue Editing
              </Button>
            </>
          )}

          {requirement.status === 'PUBLISHED' && (
            <>
              <Button
                variant="outline"
                icon={Pencil}
                disabled={busy}
                onClick={() => navigate(`/client/jobs/new/manual/${requirement.id}`)}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                icon={Ban}
                disabled={busy}
                data-testid="cancel-requirement"
                onClick={() => void run(() => jobsApi.cancel(token, requirement.id))}
              >
                {busy ? 'Working…' : 'Cancel Requirement'}
              </Button>
            </>
          )}
        </div>
      </Card>

      <ProposalsOnRequirement jobId={requirement.id} status={requirement.status} />
    </div>
  );
};

/**
 * The proposals on this requirement — Module 5's half of this screen.
 *
 * Its own component with its own request, so a slow or failing proposals
 * call never blocks the requirement itself from rendering. The client can
 * still read, edit, publish and cancel their own posting either way.
 *
 * Withdrawn proposals are shown rather than filtered: one the client has
 * already read must not silently disappear from the list they are deciding
 * from.
 */
function ProposalsOnRequirement({ jobId, status }: { jobId: string; status: JobStatus }) {
  const { navigate, accessToken } = useApp();
  const token = accessToken as string;

  const proposals = useApiResource(() => proposalsApi.forJob(token, jobId), [jobId, token], {
    enabled: Boolean(token),
  });

  const items = proposals.data?.items ?? [];

  return (
    <Card className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Proposals</h2>
        {items.length > 0 && (
          <span className="text-[11px] text-ink-muted font-mono">
            {proposals.data?.total ?? items.length} received
          </span>
        )}
      </div>

      {proposals.loading && <p className="text-xs text-ink-muted">Loading proposals…</p>}

      {proposals.error && <p className="text-xs text-destructive">{proposals.error}</p>}

      {!proposals.loading && !proposals.error && items.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="No proposals yet"
          description={
            status === 'PUBLISHED'
              ? 'Providers can see this requirement. Proposals will appear here once they start arriving.'
              : 'Publish this requirement for providers to find it and send proposals.'
          }
        />
      )}

      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((proposal) => (
            <li key={proposal.id}>
              <button
                type="button"
                data-testid="proposal-row"
                data-status={proposal.status}
                onClick={() => navigate(`/client/proposals/${proposal.id}`)}
                className="w-full p-4 bg-bg border border-border rounded-xl text-left hover:border-primary transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink truncate">
                      {proposal.providerProfile.displayName}
                    </p>
                    {proposal.providerProfile.headline && (
                      <p className="text-[11px] text-ink-muted truncate mt-0.5">
                        {proposal.providerProfile.headline}
                      </p>
                    )}
                    <p className="text-[11px] text-ink-muted mt-1.5 line-clamp-2">
                      {proposal.coverMessage}
                    </p>
                  </div>
                  <div className="shrink-0 text-right space-y-1.5">
                    <ProposalStatusBadge status={proposal.status} />
                    <p className="text-xs font-mono font-bold text-ink">{formatOffer(proposal)}</p>
                    <p className="text-[11px] text-ink-muted">{formatTurnaround(proposal)}</p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Spec({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-surface-subtle text-primary flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <span className="block text-[10px] text-ink-muted uppercase font-mono">{label}</span>
        <span className="font-semibold text-ink break-words">{value}</span>
      </div>
    </div>
  );
}
