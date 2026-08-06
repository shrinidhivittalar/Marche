import React, { useState } from 'react';
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Printer,
  User,
  Star,
  AlertTriangle,
  Gavel,
  Link as LinkIcon,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card, Input, Textarea } from '@marche/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { formatEventSchedule } from '../../lib/formatTime';

interface ContractDetailPageProps {
  id: string;
}

export const ContractDetailPage: React.FC<ContractDetailPageProps> = ({ id }) => {
  const {
    currentUser,
    getContractById,
    vendorMarkCompleted,
    clientConfirmCompletion,
    submitReview,
    getReviewForContract,
    raiseDispute,
    getDisputeForContract,
    addWorkDiaryEntry,
    getWorkDiaryForContract,
    goBack,
  } = useApp();

  const [acknowledgementOpen, setAcknowledgementOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeEvidence, setDisputeEvidence] = useState('');
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [workDiaryModalOpen, setWorkDiaryModalOpen] = useState(false);
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [workHours, setWorkHours] = useState(1);
  const [workSummary, setWorkSummary] = useState('');
  const [workProofUrl, setWorkProofUrl] = useState('');
  const [workDiaryError, setWorkDiaryError] = useState<string | null>(null);

  const contract = getContractById(id);

  if (!contract) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          title="Contract Not Found"
          description="The requested contract does not exist."
          actionLabel="Go Back"
          onAction={goBack}
        />
      </div>
    );
  }

  const agreement = contract.agreement;
  const isClient = currentUser.id === contract.clientId;
  const isVendor = currentUser.id === contract.vendorId;
  const contractReview = getReviewForContract(contract.id);
  const contractDispute = getDisputeForContract(contract.id);
  const canRaiseDispute = (isClient || isVendor) && !contractDispute && contract.bookingState !== 'Closed' && contract.bookingState !== 'Cancelled';
  const workDiaryEntries = getWorkDiaryForContract(contract.id);
  const totalLoggedHours = workDiaryEntries.reduce((total, entry) => total + entry.hours, 0);
  const canAddWorkDiary = isVendor && (contract.bookingState === 'Confirmed' || contract.bookingState === 'Completed');

  const handleClientConfirmCompletion = () => {
    clientConfirmCompletion(contract.id);
    setReviewRating(5);
    setReviewComment('');
    setReviewError(null);
    setReviewModalOpen(true);
  };

  const handleSubmitReview = () => {
    if (!reviewComment.trim()) {
      setReviewError('Add a short review before submitting.');
      return;
    }

    try {
      submitReview({ contractId: contract.id, rating: reviewRating, comment: reviewComment });
      setReviewModalOpen(false);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Unable to submit review.');
    }
  };
  const handleRaiseDispute = () => {
    if (!disputeReason.trim() || !disputeEvidence.trim()) {
      setDisputeError('Add both a reason and supporting evidence.');
      return;
    }

    try {
      raiseDispute({ contractId: contract.id, reason: disputeReason, evidence: disputeEvidence });
      setDisputeModalOpen(false);
      setDisputeReason('');
      setDisputeEvidence('');
      setDisputeError(null);
    } catch (error) {
      setDisputeError(error instanceof Error ? error.message : 'Unable to raise dispute.');
    }
  };
  const handleAddWorkDiaryEntry = () => {
    if (!workDate || workHours <= 0 || !workSummary.trim()) {
      setWorkDiaryError('Add a date, hours, and summary.');
      return;
    }

    try {
      addWorkDiaryEntry({
        contractId: contract.id,
        workDate,
        hours: workHours,
        summary: workSummary,
        proofUrl: workProofUrl,
      });
      setWorkDiaryModalOpen(false);
      setWorkHours(1);
      setWorkSummary('');
      setWorkProofUrl('');
      setWorkDiaryError(null);
    } catch (error) {
      setWorkDiaryError(error instanceof Error ? error.message : 'Unable to log work.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          <StatusBadge status={contract.bookingState} />
          <Button
            size="sm"
            variant="outline"
            icon={FileText}
            onClick={() => setAgreementOpen(true)}
          >
            Agreement Snapshot
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={FileCheck}
            onClick={() => setAcknowledgementOpen(true)}
          >
            Booking Acknowledgement
          </Button>
        </div>
      </div>

      {/* Contract Header Banner */}
      <Card className="p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-ink-muted font-mono mb-1 flex-wrap">
              <span className="truncate">Contract ID: {contract.id}</span>
              <span className="shrink-0">•</span>
              <span className="text-primary font-bold shrink-0">{contract.category}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
              {contract.jobTitle}
            </h1>
          </div>

          <div className="p-4 bg-bg border border-border rounded-2xl text-right shrink-0">
            <span className="block text-[10px] font-mono uppercase text-ink-muted">
              Agreed Booking Amount
            </span>
            <span className="text-2xl font-extrabold text-primary">
              ₹{contract.amount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* State Machine Step Progress Bar */}
        <div className="space-y-2">
          <span className="text-xs font-mono uppercase font-bold text-primary">
            Lifecycle State Machine Progress
          </span>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold">
            <div
              className={`p-2.5 rounded-xl border transition-all ${
                contract.bookingState === 'Confirmed' ||
                contract.bookingState === 'Completed' ||
                contract.bookingState === 'Closed'
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/20 text-primary'
                  : 'bg-bg border-border text-ink-muted'
              }`}
            >
              1. Confirmed
            </div>
            <div
              className={`p-2.5 rounded-xl border transition-all ${
                contract.bookingState === 'Completed' ||
                contract.bookingState === 'Closed'
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/20 text-primary'
                  : 'bg-bg border-border text-ink-muted'
              }`}
            >
              2. Event Completed
            </div>
            <div
              className={`p-2.5 rounded-xl border transition-all ${
                contract.bookingState === 'Closed'
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/20 text-primary'
                  : 'bg-bg border-border text-ink-muted'
              }`}
            >
              3. Closed
            </div>
          </div>
        </div>

        {/* Engagement Parties Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
          <div className="p-4 bg-bg border border-border rounded-2xl flex items-center gap-3">
            <User className="w-8 h-8 text-primary p-1.5 bg-surface rounded-full border border-border" />
            <div>
              <span className="block text-[10px] font-mono uppercase text-ink-muted">Client</span>
              <span className="text-xs font-bold text-ink">{contract.clientName}</span>
            </div>
          </div>

          <div className="p-4 bg-bg border border-border rounded-2xl flex items-center gap-3">
            <img
              src={contract.vendorAvatar}
              alt={contract.vendorName}
              className="w-8 h-8 rounded-full object-cover ring-1 ring-border"
            />
            <div>
              <span className="block text-[10px] font-mono uppercase text-ink-muted">
                Service Provider
              </span>
              <span className="text-xs font-bold text-ink">{contract.vendorName}</span>
            </div>
          </div>
        </div>
      </Card>
      <Card className="p-8 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-ink">Agreement snapshot</h3>
            <p className="text-xs text-ink-muted mt-1">
              Frontend record of the terms accepted when this contract was confirmed.
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${agreement ? 'bg-primary/5 border-primary/20 text-primary' : 'bg-bg border-border text-ink-muted'}`}>
            {agreement ? 'Accepted' : 'Legacy contract'}
          </span>
        </div>
        {agreement ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-bg border border-border rounded-xl">
              <span className="block text-[10px] font-mono uppercase text-ink-muted">Accepted by</span>
              <p className="font-bold text-ink mt-1">{agreement.acceptedByName}</p>
            </div>
            <div className="p-3 bg-bg border border-border rounded-xl">
              <span className="block text-[10px] font-mono uppercase text-ink-muted">Accepted on</span>
              <p className="font-bold text-ink mt-1">{new Date(agreement.acceptedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <div className="p-3 bg-bg border border-border rounded-xl">
              <span className="block text-[10px] font-mono uppercase text-ink-muted">Terms version</span>
              <p className="font-bold text-ink mt-1">{agreement.termsVersion}</p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-bg p-4 text-xs text-ink-muted">
            This demo contract was created before agreement snapshots were added, so no signed terms record is stored for it.
          </div>
        )}
      </Card>
      <Card className="p-8 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-ink">Work diary</h3>
            <p className="text-xs text-ink-muted mt-1">
              Manual proof-of-work entries for this contract. Automatic screenshots/activity capture still requires a real tracker.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 rounded-xl bg-surface-subtle border border-border text-xs font-bold text-ink">
              {totalLoggedHours.toFixed(1)} hrs logged
            </span>
            {canAddWorkDiary && (
              <Button size="sm" variant="outline" icon={Clock} onClick={() => setWorkDiaryModalOpen(true)}>
                Log Work
              </Button>
            )}
          </div>
        </div>

        {workDiaryEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-bg p-5 text-xs text-ink-muted text-center">
            No work diary entries yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {workDiaryEntries.map((entry) => (
              <div key={entry.id} className="py-4 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-bold text-ink">{entry.hours.toFixed(1)} hour{entry.hours === 1 ? '' : 's'}</p>
                    <p className="text-[11px] text-ink-muted">
                      {new Date(entry.workDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} by {entry.vendorName}
                    </p>
                  </div>
                  {entry.proofUrl && (
                    <a
                      href={entry.proofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      Proof link
                    </a>
                  )}
                </div>
                <p className="text-xs text-ink leading-relaxed">{entry.summary}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Contract Action Controls */}
      <Card className="p-8 space-y-6">
        <h3 className="text-base font-bold text-ink">Engagement Controls & Delivery</h3>

        {/* Current Booking Status Explanation */}
        {contract.bookingState === 'Confirmed' && (
          <div className="p-4 bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-900 dark:text-emerald-400 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <span>Booking Confirmed (₹{contract.amount.toLocaleString('en-IN')})</span>
            </div>
            <p className="leading-relaxed">
              This booking is confirmed for the scheduled event date ({contract.eventDate}). The provider will mark it completed once the event is delivered.
            </p>
          </div>
        )}

        {contract.bookingState === 'Completed' && (
          <div className="p-4 bg-amber-50/80 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-900 dark:text-amber-400 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <Clock className="w-5 h-5 text-amber-700 dark:text-amber-400" />
              <span>Event Marked Complete — Awaiting Your Confirmation</span>
            </div>
            <p className="leading-relaxed">
              {contract.vendorName} marked this event as delivered. Confirm below to close out the booking.
            </p>
          </div>
        )}

        {contract.bookingState === 'Closed' && (
          <div className="p-4 bg-emerald-100/60 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 text-emerald-950 dark:text-emerald-400 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-primary">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <span>Booking Completed & Closed</span>
            </div>
            <p className="leading-relaxed">
              Full payment of ₹{contract.amount.toLocaleString('en-IN')} was confirmed for {contract.vendorName}.
            </p>
          </div>
        )}
        {contract.bookingState === 'Closed' && (
          <div className="p-4 bg-bg border border-border rounded-2xl space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h4 className="text-xs font-bold text-ink">Client review</h4>
                <p className="text-[11px] text-ink-muted mt-0.5">Visible on this provider's public reputation.</p>
              </div>
              {!contractReview && isClient && (
                <Button size="sm" variant="outline" icon={Star} onClick={() => setReviewModalOpen(true)}>
                  Leave Review
                </Button>
              )}
            </div>

            {contractReview ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-600">
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star
                        key={idx}
                        className={`w-3.5 h-3.5 ${idx < contractReview.rating ? 'fill-amber-500 text-amber-500' : 'text-ink-muted'}`}
                      />
                    ))}
                  </span>
                  <span>{contractReview.rating.toFixed(1)}</span>
                </div>
                <p className="text-xs text-ink leading-relaxed">&quot;{contractReview.comment}&quot;</p>
                <p className="text-[11px] text-ink-muted">
                  {contractReview.clientName} on {new Date(contractReview.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            ) : (
              <p className="text-xs text-ink-muted">No review has been submitted for this booking yet.</p>
            )}
          </div>
        )}
        {contractDispute && (
          <div className="p-4 bg-red-50/80 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-950 dark:text-red-300 rounded-2xl space-y-3 text-xs">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-5 h-5" />
                <span>Active dispute - {contractDispute.status.replace('_', ' ')}</span>
              </div>
              <span className="font-mono text-[10px] uppercase text-red-700 dark:text-red-300">{contractDispute.id}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <span className="block text-[10px] font-mono uppercase opacity-70">Raised by</span>
                <p className="font-semibold">{contractDispute.raisedByName}</p>
              </div>
              <div>
                <span className="block text-[10px] font-mono uppercase opacity-70">Against</span>
                <p className="font-semibold">{contractDispute.raisedAgainstName}</p>
              </div>
            </div>
            <div>
              <span className="block text-[10px] font-mono uppercase opacity-70">Reason</span>
              <p className="leading-relaxed">{contractDispute.reason}</p>
            </div>
            <div>
              <span className="block text-[10px] font-mono uppercase opacity-70">Evidence</span>
              <p className="leading-relaxed">{contractDispute.evidence}</p>
            </div>
          </div>
        )}

        {/* Interactive Lifecycle Trigger Buttons */}
        <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-end gap-4">
          <div className="flex items-center gap-3">
            {/* Vendor Action */}
            {isVendor && contract.bookingState === 'Confirmed' && (
              <Button
                icon={CheckCircle2}
                onClick={() => vendorMarkCompleted(contract.id)}
              >
                [Vendor] Mark Event Completed
              </Button>
            )}

            {/* Client Action */}
            {isClient && contract.bookingState === 'Completed' && (
              <Button
                icon={CheckCircle2}
                onClick={handleClientConfirmCompletion}
              >
                [Client] Confirm Completion
              </Button>
            )}


            {canRaiseDispute && (
              <Button variant="outline" icon={Gavel} onClick={() => setDisputeModalOpen(true)}>
                Raise Dispute
              </Button>
            )}
            {contract.bookingState === 'Closed' && (
              <span className="px-4 py-2 bg-surface-subtle text-ink font-semibold rounded-xl text-xs">
                Lifecycle Complete (Terminal Closed State)
              </span>
            )}
          </div>
        </div>
      </Card>
      <Modal
        isOpen={agreementOpen}
        onClose={() => setAgreementOpen(false)}
        title="Agreement Snapshot"
        description="Frontend-only record of the booking terms accepted at hire confirmation."
        maxWidth="lg"
      >
        <div className="space-y-4 pt-2 text-xs">
          {agreement ? (
            <div className="p-5 bg-surface border border-border rounded-2xl space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <p className="text-base font-black text-ink">{agreement.jobTitle}</p>
                  <p className="text-[11px] text-ink-muted mt-1">{agreement.category} • {agreement.location}</p>
                </div>
                <StatusBadge status={contract.bookingState} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="block text-[10px] font-mono uppercase text-ink-muted">Client</span>
                  <p className="font-bold text-ink">{contract.clientName}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-mono uppercase text-ink-muted">Service provider</span>
                  <p className="font-bold text-ink">{contract.vendorName}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-mono uppercase text-ink-muted">Schedule</span>
                  <p className="font-semibold text-ink">{formatEventSchedule(agreement.eventDate, agreement.timingMode, agreement.eventStartTime, agreement.eventEndTime)}</p>
                </div>
                <div>
                  <span className="block text-[10px] font-mono uppercase text-ink-muted">Agreed amount</span>
                  <p className="font-bold text-primary">₹{agreement.amount.toLocaleString('en-IN')}</p>
                </div>
              </div>
              <div className="p-3 bg-bg border border-border rounded-xl">
                <span className="block text-[10px] font-mono uppercase text-ink-muted">Acceptance</span>
                <p className="font-semibold text-ink mt-1">
                  {agreement.acceptedByName} accepted {agreement.termsVersion} on {new Date(agreement.acceptedAt).toLocaleString()}.
                </p>
                <p className="text-[11px] text-ink-muted mt-1">Reference: {agreement.acknowledgementNumber} • Proposal: {agreement.proposalId}</p>
              </div>
              <p className="text-[10px] text-ink-muted italic leading-relaxed">
                This is a local frontend record. A legally reliable agreement still needs backend timestamping, immutable storage, user authentication, and versioned legal documents.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-bg border border-border rounded-xl text-ink-muted">
              No stored agreement snapshot exists for this contract.
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setAgreementOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={workDiaryModalOpen}
        onClose={() => setWorkDiaryModalOpen(false)}
        title="Log Work Entry"
        description="Add manual hours, a summary, and optional proof link for this contract."
        maxWidth="lg"
      >
        <div className="space-y-5 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1" htmlFor="work-date">Work date</label>
              <Input id="work-date" type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink mb-1" htmlFor="work-hours">Hours</label>
              <Input
                id="work-hours"
                type="number"
                min={0.25}
                max={24}
                step={0.25}
                value={workHours}
                onChange={(event) => setWorkHours(Number(event.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-ink" htmlFor="work-summary">Summary</label>
            <Textarea
              id="work-summary"
              rows={5}
              value={workSummary}
              onChange={(event) => {
                setWorkSummary(event.target.value);
                setWorkDiaryError(null);
              }}
              placeholder="Describe what you completed, where you worked, and what deliverables moved forward."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1" htmlFor="work-proof">Proof link</label>
            <Input
              id="work-proof"
              value={workProofUrl}
              onChange={(event) => setWorkProofUrl(event.target.value)}
              placeholder="Optional URL to gallery, folder, or status update"
            />
          </div>
          {workDiaryError && <p className="text-xs font-medium text-red-600">{workDiaryError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="outline" size="sm" onClick={() => setWorkDiaryModalOpen(false)}>Cancel</Button>
            <Button size="sm" icon={Clock} onClick={handleAddWorkDiaryEntry}>Save Entry</Button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={disputeModalOpen}
        onClose={() => setDisputeModalOpen(false)}
        title="Raise a Dispute"
        description="Send the issue and supporting evidence for admin review in this frontend preview."
        maxWidth="lg"
      >
        <div className="space-y-5 pt-2">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
            Disputes are stored locally and notify the other party plus the demo admin. Real mediation, evidence storage, and arbitration still require backend support.
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-ink" htmlFor="dispute-reason">Reason</label>
            <Textarea
              id="dispute-reason"
              rows={4}
              value={disputeReason}
              onChange={(event) => {
                setDisputeReason(event.target.value);
                setDisputeError(null);
              }}
              placeholder="What went wrong?"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-ink" htmlFor="dispute-evidence">Evidence</label>
            <Textarea
              id="dispute-evidence"
              rows={5}
              value={disputeEvidence}
              onChange={(event) => {
                setDisputeEvidence(event.target.value);
                setDisputeError(null);
              }}
              placeholder="Add timelines, message summaries, deliverable notes, or payment context."
            />
            {disputeError && <p className="text-xs font-medium text-red-600">{disputeError}</p>}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" size="sm" onClick={() => setDisputeModalOpen(false)}>Cancel</Button>
            <Button size="sm" icon={Gavel} onClick={handleRaiseDispute}>Submit Dispute</Button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title="Leave a Review"
        description={`Share how ${contract.vendorName} did on this booking.`}
        maxWidth="md"
      >
        <div className="space-y-5 pt-2">
          <div className="flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, idx) => {
              const value = idx + 1;
              const active = value <= reviewRating;
              return (
                <button
                  key={value}
                  type="button"
                  title={`${value} star${value === 1 ? '' : 's'}`}
                  onClick={() => setReviewRating(value)}
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary/10 border-primary text-amber-500'
                      : 'bg-bg border-border text-ink-muted hover:text-amber-500 hover:border-primary/50'
                  }`}
                >
                  <Star className="w-5 h-5" fill={active ? 'currentColor' : 'none'} />
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-ink" htmlFor="contract-review-comment">
              Review
            </label>
            <Textarea
              id="contract-review-comment"
              rows={5}
              value={reviewComment}
              onChange={(event) => {
                setReviewComment(event.target.value);
                setReviewError(null);
              }}
              placeholder="What went well? Was communication, quality, and delivery as expected?"
            />
            {reviewError && <p className="text-xs font-medium text-red-600">{reviewError}</p>}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" size="sm" onClick={() => setReviewModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" icon={Star} onClick={handleSubmitReview}>
              Submit Review
            </Button>
          </div>
        </div>
      </Modal>

      {/* Official Non-Fiscal Booking Acknowledgement Modal */}
      <Modal
        isOpen={acknowledgementOpen}
        onClose={() => setAcknowledgementOpen(false)}
        title="Official Booking Acknowledgement"
        description="A non-fiscal confirmation of your marketplace service reservation."
        maxWidth="xl"
      >
        <div className="space-y-6 pt-2 text-xs">
          <div className="p-6 bg-surface border border-border rounded-2xl shadow-xs space-y-4">
            <div className="flex justify-between items-start border-b border-border pb-4">
              <div>
                <span className="text-lg font-black text-ink tracking-tight">MARCHÉ</span>
                <span className="block text-[10px] font-mono text-ink-muted">
                  Booking Reference ID: {contract.acknowledgementNumber}
                </span>
              </div>
              <StatusBadge status={contract.bookingState} />
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[10px] font-mono uppercase text-ink-muted">Client</span>
                <p className="font-bold text-ink">{contract.clientName}</p>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-ink-muted">
                  Service Provider
                </span>
                <p className="font-bold text-ink">{contract.vendorName}</p>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-ink-muted">Event Date & Time</span>
                <p className="font-semibold text-ink">
                  {formatEventSchedule(contract.eventDate, contract.timingMode, contract.eventStartTime, contract.eventEndTime)}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-ink-muted">Category</span>
                <p className="font-bold text-primary">{contract.category}</p>
              </div>
            </div>

            <div className="p-3 bg-bg border border-border rounded-xl flex justify-between font-mono font-bold text-sm">
              <span>Contract Agreed Total:</span>
              <span className="text-primary">₹{contract.amount.toLocaleString('en-IN')}</span>
            </div>

            <p className="text-[10px] text-ink-muted italic leading-relaxed pt-2 border-t border-border">
              Notice: This document is a non-fiscal confirmation of a marketplace service reservation. It does not constitute a tax invoice.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              icon={Printer}
              onClick={() => window.print()}
            >
              Print Document
            </Button>
            <Button size="sm" onClick={() => setAcknowledgementOpen(false)}>
              Close View
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
