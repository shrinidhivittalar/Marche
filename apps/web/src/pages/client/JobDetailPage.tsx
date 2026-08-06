import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  Clock,
  MapPin,
  Star,
  FileCheck,
  FileText,
  CheckCircle2,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card } from '@marche/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { formatTimeRange } from '../../lib/formatTime';
import { formatFileSize } from '../../lib/formatFile';
import { formatBudget } from '../../lib/formatBudget';

interface JobDetailPageProps {
  id: string;
}

export const JobDetailPage: React.FC<JobDetailPageProps> = ({ id }) => {
  const {
    getJobById,
    getProposalsForJob,
    getContractByJobId,
    auditLogs,
    navigate,
    goBack,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'proposals' | 'specs' | 'audit'>('proposals');

  const job = getJobById(id);
  const proposals = getProposalsForJob(id);
  const activeContract = getContractByJobId(id);

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          title="Job Not Found"
          description="The requested job does not exist or was removed."
          actionLabel="Go Back"
          onAction={goBack}
        />
      </div>
    );
  }

  const reqLogs = auditLogs.filter((log) => log.targetEntity.includes(job.id));

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Top Back Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2">
          <StatusBadge status={job.status} />
          {activeContract && (
            <Button
              size="sm"
              variant="outline"
              icon={ShieldCheck}
              onClick={() => navigate(`/contracts/${activeContract.id}`)}
            >
              View Active Contract
            </Button>
          )}
        </div>
      </div>

      {/* Main Job Header Card */}
      <Card className="p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 border-b border-border pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-surface-subtle text-xs font-bold text-primary border border-border">
                {job.category}
              </span>
              <span className="text-xs font-mono text-ink-muted">
                Posted {new Date(job.createdAt).toLocaleDateString()}
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
              {job.title}
            </h1>
          </div>

          <div className="bg-bg border border-border rounded-2xl p-4 text-right shrink-0">
            <span className="block text-[10px] font-mono uppercase text-ink-muted">
              {job.budgetMode === 'fixed' ? 'Fixed Budget' : 'Budget Bounds'}
            </span>
            <span className="text-xl font-bold text-primary">
              {formatBudget(job)}
            </span>
          </div>
        </div>

        {/* Quick Specs Metadata Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-subtle text-primary flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-[10px] text-ink-muted uppercase font-mono">
                Event Date
              </span>
              <span className="font-semibold text-ink">{job.eventDate}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-subtle text-primary flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-[10px] text-ink-muted uppercase font-mono">
                Event Time
              </span>
              <span className="font-semibold text-ink">
                {job.eventStartTime && job.eventEndTime
                  ? formatTimeRange(job.eventStartTime, job.eventEndTime)
                  : 'Flexible'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-subtle text-primary flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-[10px] text-ink-muted uppercase font-mono">
                Location
              </span>
              <span className="font-semibold text-ink truncate max-w-[140px] block">
                {job.location}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-subtle text-primary flex items-center justify-center">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-[10px] text-ink-muted uppercase font-mono">
                Proposals
              </span>
              <span className="font-semibold text-ink">
                {proposals.length} Submitted
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-subtle text-primary flex items-center justify-center">
              <CalendarClock className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-[10px] text-ink-muted uppercase font-mono">
                Proposal Deadline
              </span>
              <span className="font-semibold text-ink">{job.proposalDeadline}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs Navigation */}
      <div className="border-b border-border flex gap-6">
        <button
          onClick={() => setActiveTab('proposals')}
          className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'proposals'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          Proposals Inbox ({proposals.length})
        </button>

        <button
          onClick={() => setActiveTab('specs')}
          className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'specs'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          Scope & Deliverables Checklist
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'audit'
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          Audit History ({reqLogs.length})
        </button>
      </div>

      {/* TAB 1: Proposals Inbox */}
      {activeTab === 'proposals' && (
        <div className="space-y-4">
          {proposals.length === 0 ? (
            <EmptyState
              title="No proposals received yet"
              description="Your job is live in the marketplace. Service providers are reviewing the specifications."
            />
          ) : (
            proposals.map((proposal) => (
              <div
                key={proposal.id}
                onClick={() => navigate(`/client/proposals/${proposal.id}`)}
                className="bg-white border border-border rounded-2xl p-6 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={proposal.vendorAvatar}
                      alt={proposal.vendorName}
                      className="w-12 h-12 rounded-full object-cover ring-1 ring-border"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-ink truncate">
                          {proposal.vendorName}
                        </h3>
                        <StatusBadge status={proposal.status} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-ink-muted mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 font-semibold text-amber-600 shrink-0">
                          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                          {proposal.vendorRating} ({proposal.vendorReviewCount} reviews)
                        </span>
                        <span className="shrink-0">•</span>
                        <span className="truncate">{proposal.vendorLocation}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="block text-[10px] font-mono uppercase text-ink-muted">
                      Proposed Quote
                    </span>
                    <span className="text-xl font-extrabold text-primary">
                      ₹{proposal.bidAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-ink-muted line-clamp-3 leading-relaxed">
                  "{proposal.coverLetter}"
                </p>

                <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-ink-muted">
                  <span>Delivery timeline: {proposal.estimatedDelivery}</span>
                  <span className="font-bold text-primary hover:underline flex items-center gap-1">
                    Review Quote & Milestones <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: Scope & Deliverables */}
      {activeTab === 'specs' && (
        <Card className="p-8 space-y-6">
          <div>
            <h3 className="text-xs font-mono uppercase font-bold text-primary mb-2">
              Full Job Scope
            </h3>
            <p className="text-xs text-ink leading-relaxed whitespace-pre-line">
              {job.description}
            </p>
          </div>

          <div className="pt-6 border-t border-border">
            <h3 className="text-xs font-mono uppercase font-bold text-primary mb-4">
              Required Deliverables ({job.deliverables.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {job.deliverables.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-bg border border-border rounded-xl text-xs text-ink flex items-center gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {job.attachments && job.attachments.length > 0 && (
            <div className="pt-6 border-t border-border">
              <h3 className="text-xs font-mono uppercase font-bold text-primary mb-4">
                Reference Documents ({job.attachments.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {job.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.dataUrl}
                    download={att.name}
                    className="p-3 bg-bg border border-border rounded-xl text-xs text-ink flex items-center gap-2.5 hover:border-zinc-300 hover:shadow-xs transition-all"
                  >
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate flex-1">{att.name}</span>
                    <span className="text-ink-muted shrink-0">{formatFileSize(att.size)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: Audit Trail */}
      {activeTab === 'audit' && (
        <Card className="p-8 space-y-4">
          <h3 className="text-xs font-mono uppercase font-bold text-primary">
            State Transition Audit Log
          </h3>

          <div className="space-y-3">
            {reqLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 bg-bg border border-border rounded-xl text-xs flex items-start justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">{log.action}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-border text-ink-muted">
                      {log.actorRole}
                    </span>
                  </div>
                  <p className="text-ink-muted text-[11px] mt-1">
                    Actor: {log.actorName} ({log.actorId})
                  </p>
                  {log.beforeState && log.afterState && (
                    <p className="text-[11px] font-mono text-primary mt-1">
                      {log.beforeState} → {log.afterState}
                    </p>
                  )}
                </div>

                <span className="text-[10px] font-mono text-ink-muted shrink-0">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
