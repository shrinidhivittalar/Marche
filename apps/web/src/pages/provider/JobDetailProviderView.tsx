import React from 'react';
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  MapPin,
  CheckCircle2,
  Send,
  FileText,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useApiResource } from '../../hooks/useApiResource';
import { jobsApi } from '../../lib/jobs-api';
import { reviewsApi } from '../../lib/reviews-api';
import { CategoryRequirementsDisplay } from '../../components/jobs/CategoryRequirementsDisplay';
import { formatJobBudget, formatEventWhen, formatDeadline } from '../../lib/formatJob';

const memberSinceFormat = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

// A published requirement as a provider sees it, on the real Jobs API.
//
// Two things changed with the rewire:
//
// - Proposal state is gone from this screen. It was read from mock
//   proposals keyed by mock job ids, which can never match a real one, so
//   the "already submitted" and "continue draft" branches were dead the
//   moment the ids became real. Module 5 owns that; the CTA stays as the
//   handover point.
// - Attachments are fetched separately and only when signed in. The
//   requirement itself is public, but its files are not — a guest can read
//   what is being asked for without downloading the client's floor plan.

interface JobDetailProviderViewProps {
  id: string;
}

export const JobDetailProviderView: React.FC<JobDetailProviderViewProps> = ({ id }) => {
  const { navigate, goBack, accessToken } = useApp();

  const job = useApiResource(() => jobsApi.byId(id), [id]);

  // Deliberately a second request rather than part of the requirement:
  // the attachments endpoint is authenticated and this page is not.
  const attachments = useApiResource(
    () => jobsApi.attachments(accessToken as string, id),
    [id, accessToken],
    {
      enabled: Boolean(accessToken),
    },
  );

  const clientProfileId = job.data?.clientProfile.id;
  const clientStats = useApiResource(
    () => jobsApi.clientStats(clientProfileId as string),
    [clientProfileId],
    { enabled: Boolean(clientProfileId) },
  );
  const clientHistory = useApiResource(
    () => reviewsApi.clientHistory(clientProfileId as string),
    [clientProfileId],
    { enabled: Boolean(clientProfileId) },
  );

  if (job.loading) {
    return <p className="text-xs text-ink-muted py-12 text-center">Loading requirement…</p>;
  }

  if (job.error || !job.data) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          title="Requirement not found"
          description={
            job.error ?? 'It may have been cancelled or filled, or it was never published.'
          }
          actionLabel="Browse requirements"
          onAction={() => navigate('/provider/search')}
        />
      </div>
    );
  }

  const requirement = job.data;
  const when = formatEventWhen(requirement);
  const deadline = formatDeadline(requirement);
  const files = attachments.data ?? [];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 @container">
      <div className="flex items-center justify-between">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Marketplace</span>
        </button>
      </div>

      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-8">
        <div className="@2xl:col-span-2 space-y-6">
          <Card className="p-8 space-y-6">
            <div className="pb-6 border-b border-border">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="px-3 py-1 rounded-full bg-surface-subtle text-xs font-bold text-primary border border-border">
                  {requirement.category.name}
                </span>
                <span className="text-xs font-mono text-ink-muted">
                  Posted{' '}
                  {new Date(requirement.publishedAt ?? requirement.createdAt).toLocaleDateString()}
                </span>
                <span className="text-xs font-mono text-ink-muted">
                  · {requirement.proposalCount} proposal
                  {requirement.proposalCount === 1 ? '' : 's'}
                </span>
              </div>

              <h1
                className="text-2xl font-extrabold text-ink tracking-tight"
                data-testid="job-detail-title"
              >
                {requirement.title}
              </h1>
            </div>

            <div>
              <h3 className="text-xs font-mono uppercase font-bold text-primary mb-2">
                What the client needs
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
                      className="p-3 bg-white border border-border rounded-xl text-xs text-ink flex items-center gap-2.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      <span>{deliverable}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <CategoryRequirementsDisplay
              categorySlug={requirement.category.slug}
              categoryTemplateId={requirement.categoryTemplateId}
              categoryData={requirement.categoryData}
            />

            <div>
              <h3 className="text-xs font-mono uppercase font-bold text-primary mb-3">
                Reference Documents
              </h3>

              {!accessToken ? (
                <p className="text-xs text-ink-muted" data-testid="attachments-signed-out">
                  Sign in to view the files attached to this requirement.
                </p>
              ) : files.length === 0 ? (
                <p className="text-xs text-ink-muted">No documents attached.</p>
              ) : (
                <div className="space-y-2">
                  {files.map((file) => (
                    <a
                      key={file.id}
                      href={file.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      // A null url means the file never finished uploading.
                      // Rendered as plain text rather than a dead link.
                      className={`p-3 bg-white border border-border rounded-xl text-xs text-ink flex items-center gap-2.5 ${
                        file.url
                          ? 'hover:border-zinc-300 hover:shadow-xs transition-all'
                          : 'opacity-60'
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
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-6 sticky top-24">
            <div>
              <span className="block text-[10px] font-mono uppercase text-ink-muted">
                Client Budget
              </span>
              <p className="text-2xl font-extrabold text-primary" data-testid="job-detail-budget">
                {formatJobBudget(requirement)}
              </p>
            </div>

            <div className="space-y-3 pt-4 border-t border-border text-xs">
              {when && (
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div>
                    <span className="block text-[10px] text-ink-muted">Event Date &amp; Time</span>
                    <span className="font-semibold text-ink">{when}</span>
                  </div>
                </div>
              )}

              {requirement.locationCoarse && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div>
                    <span className="block text-[10px] text-ink-muted">Venue / City</span>
                    <span className="font-semibold text-ink">{requirement.locationCoarse}</span>
                  </div>
                </div>
              )}

              {deadline && (
                <div className="flex items-center gap-3">
                  <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="block text-[10px] text-ink-muted">Proposal Deadline</span>
                    <span className="font-semibold text-amber-700">{deadline}</span>
                  </div>
                </div>
              )}

              {requirement.serviceMode && (
                <div className="flex items-center gap-3">
                  <Layers className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div>
                    <span className="block text-[10px] text-ink-muted">Service Mode</span>
                    <span className="font-semibold text-ink">{requirement.serviceMode}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-bg border border-border rounded-2xl space-y-2 text-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-ink-muted">
                About the Client
              </span>
              <div className="flex items-center gap-2.5 pt-1">
                {/* Initials rather than an avatar: the requirement payload
                    carries the client's name and location, not their
                    picture, and fetching a whole profile for one image on
                    every card would be a second request per requirement. */}
                <span className="w-8 h-8 rounded-full bg-surface-subtle ring-1 ring-border flex items-center justify-center text-[11px] font-bold text-ink">
                  {requirement.clientProfile.displayName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <span className="block font-bold text-ink truncate">
                    {requirement.clientProfile.displayName}
                  </span>
                  <span className="block text-[10px] text-ink-muted truncate">
                    {requirement.clientProfile.location ?? 'Location not stated'}
                  </span>
                </div>
              </div>
              {requirement.clientProfile.verifiedAt && (
                <span className="flex items-center gap-1 text-primary font-semibold text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified client
                </span>
              )}

              {/* Real hiring history — no spend or hourly-rate figures, since
                  this app has no payment integration to back them. */}
              {clientStats.data && (
                <div className="pt-2 mt-1 border-t border-border space-y-1 text-[11px] text-ink-muted">
                  <div className="flex justify-between">
                    <span>Jobs posted</span>
                    <span className="font-semibold text-ink">{clientStats.data.jobsPosted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hire rate</span>
                    <span className="font-semibold text-ink">
                      {clientStats.data.hireRate !== null
                        ? `${Math.round(clientStats.data.hireRate * 100)}%`
                        : 'Not yet hired'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Member since</span>
                    <span className="font-semibold text-ink">
                      {memberSinceFormat.format(new Date(clientStats.data.memberSince))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <Button
              size="lg"
              className="w-full"
              icon={Send}
              data-testid="submit-proposal-cta"
              onClick={() => navigate(`/provider/submit-proposal/${requirement.id}`)}
            >
              Submit Proposal Now
            </Button>
          </Card>

          {/* What this client has hired for before, and how it went — only
              reviews visible to the public (see ReviewsService.clientHistory).
              Absent entirely rather than an empty state: a client with no
              revealed history yet is the common case, not a broken one. */}
          {clientHistory.data && clientHistory.data.length > 0 && (
            <Card className="p-6 space-y-4">
              <span className="block text-[10px] font-mono uppercase font-bold text-ink-muted">
                Client&rsquo;s Recent History
              </span>
              <div className="space-y-3">
                {clientHistory.data.map((entry) => (
                  <div
                    key={entry.jobId}
                    className="text-xs border-t border-border pt-3 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink truncate">{entry.jobTitle}</span>
                      <span className="flex items-center gap-1 text-primary font-bold shrink-0">
                        {entry.rating}★
                      </span>
                    </div>
                    {entry.providerDisplayName && (
                      <span className="block text-[10px] text-ink-muted mt-0.5">
                        Hired {entry.providerDisplayName}
                      </span>
                    )}
                    <p className="text-ink-muted mt-1 line-clamp-2">{entry.comment}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
