import React from 'react';
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  Clock,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  User,
  Send,
  Building,
  DollarSign,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card } from '@marche/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { formatEventSchedule } from '../../lib/formatTime';

interface JobDetailProviderViewProps {
  id: string;
}

export const JobDetailProviderView: React.FC<
  JobDetailProviderViewProps
> = ({ id }) => {
  const { getJobById, proposals, currentUser, navigate, goBack } = useApp();

  const job = getJobById(id);

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          title="Job Not Found"
          description="The requested job is unavailable."
          actionLabel="Browse Jobs"
          onAction={() => navigate('/provider/dashboard')}
        />
      </div>
    );
  }

  // Check if current vendor already submitted a proposal
  const existingProposal = proposals.find(
    (p) => p.jobId === id && p.vendorId === currentUser.id
  );

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 @container">
      {/* Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Marketplace</span>
        </button>

        <StatusBadge status={job.status} />
      </div>

      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-8">
        {/* Main Job Overview */}
        <div className="@2xl:col-span-2 space-y-6">
          <Card className="p-8 space-y-6">
            <div className="pb-6 border-b border-border">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 rounded-full bg-surface-subtle text-xs font-bold text-primary border border-border">
                  {job.category}
                </span>
                <span className="text-xs font-mono text-ink-muted">
                  Posted {new Date(job.createdAt).toLocaleDateString()}
                </span>
              </div>

              <h1 className="text-2xl font-extrabold text-ink tracking-tight">
                {job.title}
              </h1>
            </div>

            <div>
              <h3 className="text-xs font-mono uppercase font-bold text-primary mb-2">
                Job Description
              </h3>
              <p className="text-xs text-ink leading-relaxed whitespace-pre-line bg-bg p-4 border border-border rounded-xl">
                {job.description}
              </p>
            </div>

            {/* Required Deliverables */}
            <div>
              <h3 className="text-xs font-mono uppercase font-bold text-primary mb-3">
                Expected Deliverables
              </h3>
              <div className="space-y-2">
                {job.deliverables.map((d, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white border border-border rounded-xl text-xs text-ink flex items-center gap-2.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    <span>{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar: Budget, Client Info & CTA */}
        <div className="space-y-6">
          <Card className="p-6 space-y-6 sticky top-24">
            <div>
              <span className="block text-[10px] font-mono uppercase text-ink-muted">
                Client Budget Range
              </span>
              <p className="text-2xl font-extrabold text-primary">
                ${job.budgetMin.toLocaleString()} - ${job.budgetMax.toLocaleString()}
              </p>
            </div>

            <div className="space-y-3 pt-4 border-t border-border text-xs">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-zinc-400 shrink-0" />
                <div>
                  <span className="block text-[10px] text-ink-muted">Event Date & Time</span>
                  <span className="font-semibold text-ink">
                    {formatEventSchedule(job.eventDate, job.timingMode, job.eventStartTime, job.eventEndTime)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
                <div>
                  <span className="block text-[10px] text-ink-muted">Venue / City</span>
                  <span className="font-semibold text-ink">{job.location}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="block text-[10px] text-ink-muted">Proposal Deadline</span>
                  <span className="font-semibold text-amber-700">{job.proposalDeadline}</span>
                </div>
              </div>
            </div>

            {/* Client Info Box */}
            <div className="p-4 bg-bg border border-border rounded-2xl space-y-2 text-xs">
              <span className="text-[10px] font-mono uppercase font-bold text-ink-muted">
                About the Client
              </span>
              <div className="flex items-center gap-2.5 pt-1">
                <img
                  src={job.clientAvatar}
                  alt={job.clientName}
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-border"
                />
                <div>
                  <span className="block font-bold text-ink">
                    {job.clientName}
                  </span>
                  <span className="block text-[10px] text-ink-muted">
                    {job.clientCompany || 'Verified Client'}
                  </span>
                </div>
              </div>
            </div>

            {existingProposal ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold text-center space-y-1">
                <span>You Have Already Submitted a Proposal</span>
                <span className="block text-[11px] text-emerald-700 font-mono">
                  Quote: ${existingProposal.bidAmount.toLocaleString()}
                </span>
              </div>
            ) : (
              <Button
                size="lg"
                className="w-full"
                icon={Send}
                onClick={() => navigate(`/provider/submit-proposal/${job.id}`)}
              >
                Submit Proposal Now
              </Button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
