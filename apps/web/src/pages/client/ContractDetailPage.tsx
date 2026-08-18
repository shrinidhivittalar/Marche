import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck,
  Gavel,
  Printer,
  ShieldCheck,
  Star,
  User,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card, Textarea } from '@marche/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { useApiResource } from '../../hooks/useApiResource';
import { connectionsApi } from '../../lib/proposals-api';
import { reviewsApi } from '../../lib/reviews-api';
import { disputesApi } from '../../lib/disputes-api';
import { ApiError } from '../../lib/api';

interface ContractDetailPageProps {
  id: string; // connection id
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// This is the real Connection lifecycle (module5-completion.md /
// module5-reviews.md): ACTIVE -> COMPLETED, client confirms after the event
// date (or it completes on its own after a grace period), either party may
// then review the other once, and either may raise a dispute at any point
// (not gated on status — see the Dispute schema comment). It replaced a
// mock 10-state Draft/Open/.../Closed machine with a vendor-then-client
// two-step confirm that no backend ever backed. Work Diary and the
// Agreement Snapshot modal still aren't here because no real module exists
// yet for either; showing an elaborate fake version of those next to the
// now-real completion/review/dispute flow would be exactly the
// inconsistency this rewrite is fixing.
export const ContractDetailPage: React.FC<ContractDetailPageProps> = ({ id }) => {
  const { currentUser, accessToken, goBack } = useApp();
  const token = accessToken as string;
  const isClient = currentUser.role === 'client';

  const connection = useApiResource(() => connectionsApi.byId(token, id), [token, id], {
    enabled: Boolean(token),
  });

  const isCompleted = connection.data?.status === 'COMPLETED';
  const myReview = useApiResource(
    () => (isCompleted ? reviewsApi.mine(token, id) : Promise.resolve(null)),
    [token, id, isCompleted],
    { enabled: Boolean(token && isCompleted) },
  );

  const disputes = useApiResource(() => disputesApi.forConnection(token, id), [token, id], {
    enabled: Boolean(token),
  });

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeEvidence, setDisputeEvidence] = useState('');
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [submittingDispute, setSubmittingDispute] = useState(false);

  if (connection.loading) {
    return <p className="text-xs text-ink-muted py-12 text-center">Loading contract…</p>;
  }

  if (!connection.data) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          title="Contract Not Found"
          description={connection.error ?? 'The requested contract does not exist.'}
          actionLabel="Go Back"
          onAction={goBack}
        />
      </div>
    );
  }

  const c = connection.data;
  const otherParty = isClient ? c.providerProfile : c.clientProfile;
  const amount = Number(c.proposal.proposedPrice);
  const eventHasPassed =
    Boolean(c.job.eventDate) &&
    new Date(c.job.eventDate as string).getTime() <= new Date().getTime();
  const canConfirmComplete = isClient && c.status === 'ACTIVE' && eventHasPassed;

  const handleConfirmComplete = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      await connectionsApi.complete(token, id);
      await connection.refetch();
    } catch (error) {
      setConfirmError(error instanceof ApiError ? error.message : 'Unable to confirm completion.');
    } finally {
      setConfirming(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewComment.trim()) {
      setReviewError('Add a short review before submitting.');
      return;
    }
    setSubmittingReview(true);
    setReviewError(null);
    try {
      await reviewsApi.submit(token, id, reviewRating, reviewComment.trim());
      await myReview.refetch();
      setReviewComment('');
    } catch (error) {
      setReviewError(error instanceof ApiError ? error.message : 'Unable to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleRaiseDispute = async () => {
    if (disputeReason.trim().length < 10 || disputeEvidence.trim().length < 10) {
      setDisputeError('Add at least a couple of sentences for both the reason and the evidence.');
      return;
    }
    setSubmittingDispute(true);
    setDisputeError(null);
    try {
      await disputesApi.raise(token, id, disputeReason.trim(), disputeEvidence.trim());
      await disputes.refetch();
      setDisputeModalOpen(false);
      setDisputeReason('');
      setDisputeEvidence('');
    } catch (error) {
      setDisputeError(error instanceof ApiError ? error.message : 'Unable to raise dispute.');
    } finally {
      setSubmittingDispute(false);
    }
  };

  const activeDispute = disputes.data?.find((d) => d.status !== 'RESOLVED');
  const resolvedDisputes = disputes.data?.filter((d) => d.status === 'RESOLVED') ?? [];

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
          <span data-testid="connection-status" data-status={c.status}>
            <StatusBadge status={c.status} />
          </span>
          <Button size="sm" variant="outline" icon={FileCheck} onClick={() => setInvoiceOpen(true)}>
            View Invoice
          </Button>
        </div>
      </div>

      {/* Contract Header Banner */}
      <Card className="p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-ink-muted font-mono mb-1 flex-wrap">
              <span className="truncate">Connection ID: {c.id}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
              {c.job.title}
            </h1>
          </div>

          <div className="p-4 bg-bg border border-border rounded-2xl text-right shrink-0">
            <span className="block text-[10px] font-mono uppercase text-ink-muted">
              Agreed Booking Amount
            </span>
            <span className="text-2xl font-extrabold text-primary">
              ₹{amount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
          <div className="p-4 bg-bg border border-border rounded-2xl flex items-center gap-3">
            <User className="w-8 h-8 text-primary p-1.5 bg-surface rounded-full border border-border" />
            <div>
              <span className="block text-[10px] font-mono uppercase text-ink-muted">Client</span>
              <span className="text-xs font-bold text-ink">{c.clientProfile.displayName}</span>
            </div>
          </div>

          <div className="p-4 bg-bg border border-border rounded-2xl flex items-center gap-3">
            <User className="w-8 h-8 text-primary p-1.5 bg-surface rounded-full border border-border" />
            <div>
              <span className="block text-[10px] font-mono uppercase text-ink-muted">
                Service Provider
              </span>
              <span className="text-xs font-bold text-ink">{c.providerProfile.displayName}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Completion */}
      <Card className="p-8 space-y-5">
        <h3 className="text-base font-bold text-ink">Completion</h3>

        {c.status === 'ACTIVE' && (
          <div className="p-4 bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-900 dark:text-emerald-400 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <span>Active (₹{amount.toLocaleString('en-IN')})</span>
            </div>
            <p className="leading-relaxed">
              {c.job.eventDate
                ? `Scheduled for ${formatDate(c.job.eventDate)}. The client can confirm completion once the event date has passed.`
                : 'This requirement has no event date set, so completion can only happen automatically once one is.'}
            </p>
          </div>
        )}

        {c.status === 'COMPLETED' && (
          <div className="p-4 bg-emerald-100/60 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 text-emerald-950 dark:text-emerald-400 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-primary">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <span>Completed</span>
            </div>
            <p className="leading-relaxed">
              {c.completedAt
                ? `Confirmed complete on ${formatDate(c.completedAt)}.`
                : 'Confirmed complete.'}
            </p>
          </div>
        )}

        {confirmError && (
          <p className="text-xs font-medium text-red-600" data-testid="confirm-complete-error">
            {confirmError}
          </p>
        )}

        {canConfirmComplete && (
          <div className="pt-2 flex justify-end">
            <Button
              icon={CheckCircle2}
              onClick={handleConfirmComplete}
              disabled={confirming}
              data-testid="confirm-complete"
            >
              Confirm Completion
            </Button>
          </div>
        )}
        {isClient && c.status === 'ACTIVE' && !eventHasPassed && (
          <p className="text-[11px] text-ink-muted">
            You can confirm completion once the event date has passed. It also completes on its own
            a few days after the event if you don't.
          </p>
        )}
      </Card>

      {/* Review */}
      {c.status === 'COMPLETED' && (
        <Card className="p-8 space-y-4">
          <div>
            <h3 className="text-base font-bold text-ink">
              Your review of {otherParty.displayName}
            </h3>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Stays hidden on their public profile until {otherParty.displayName} reviews you back,
              or 14 days pass.
            </p>
          </div>

          {myReview.loading ? (
            <p className="text-xs text-ink-muted">Loading…</p>
          ) : myReview.data ? (
            <div className="space-y-2" data-testid="my-review" data-rating={myReview.data.rating}>
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-600">
                <span className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`w-3.5 h-3.5 ${idx < myReview.data!.rating ? 'fill-amber-500 text-amber-500' : 'text-ink-muted'}`}
                    />
                  ))}
                </span>
                <span>{myReview.data.rating.toFixed(1)}</span>
              </div>
              <p className="text-xs text-ink leading-relaxed">
                &quot;{myReview.data.comment}&quot;
              </p>
              <p className="text-[11px] text-ink-muted">
                Submitted {formatDate(myReview.data.createdAt)}
              </p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="review-form">
              <div className="flex items-center gap-2">
                {Array.from({ length: 5 }).map((_, idx) => {
                  const value = idx + 1;
                  const active = value <= reviewRating;
                  return (
                    <button
                      key={value}
                      type="button"
                      title={`${value} star${value === 1 ? '' : 's'}`}
                      data-testid={`review-rating-${value}`}
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
              <Textarea
                data-testid="review-comment-input"
                rows={4}
                value={reviewComment}
                onChange={(event) => {
                  setReviewComment(event.target.value);
                  setReviewError(null);
                }}
                placeholder="What went well? Was communication, quality, and delivery as expected?"
              />
              {reviewError && (
                <p className="text-xs font-medium text-red-600" data-testid="review-error">
                  {reviewError}
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  icon={Star}
                  onClick={handleSubmitReview}
                  disabled={submittingReview}
                  data-testid="submit-review"
                >
                  Submit Review
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Dispute */}
      <Card className="p-8 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-ink">Dispute</h3>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Reviewed by a Marché admin — not automatically resolved by either party.
            </p>
          </div>
          {!activeDispute && (
            <Button
              size="sm"
              variant="outline"
              icon={Gavel}
              onClick={() => setDisputeModalOpen(true)}
              data-testid="raise-dispute"
            >
              Raise Dispute
            </Button>
          )}
        </div>

        {disputes.loading ? (
          <p className="text-xs text-ink-muted">Loading…</p>
        ) : activeDispute ? (
          <div
            className="p-4 bg-red-50/80 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-950 dark:text-red-300 rounded-2xl space-y-3 text-xs"
            data-testid="active-dispute"
            data-status={activeDispute.status}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-5 h-5" />
                <span>{activeDispute.status.replace('_', ' ')}</span>
              </div>
              <span className="text-[11px] text-red-800 dark:text-red-300">
                Raised by{' '}
                {activeDispute.raisedByUserId === currentUser.id ? 'you' : otherParty.displayName}{' '}
                on {formatDate(activeDispute.createdAt)}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-mono uppercase opacity-70">Reason</span>
              <p className="leading-relaxed">{activeDispute.reason}</p>
            </div>
            <div>
              <span className="block text-[10px] font-mono uppercase opacity-70">Evidence</span>
              <p className="leading-relaxed">{activeDispute.evidence}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-muted">No dispute has been raised on this booking.</p>
        )}

        {resolvedDisputes.length > 0 && (
          <div className="pt-2 space-y-2">
            <span className="text-[10px] font-mono uppercase text-ink-muted">Resolved</span>
            {resolvedDisputes.map((dispute) => (
              <div
                key={dispute.id}
                className="p-3 rounded-xl border border-border bg-bg text-xs space-y-1"
              >
                <p className="text-ink-muted">{dispute.reason}</p>
                {dispute.resolution && (
                  <p className="text-ink">
                    <span className="font-semibold">Resolution: </span>
                    {dispute.resolution}
                  </p>
                )}
                {dispute.resolvedAt && (
                  <p className="text-[11px] text-ink-muted">
                    Resolved {formatDate(dispute.resolvedAt)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        isOpen={disputeModalOpen}
        onClose={() => setDisputeModalOpen(false)}
        title="Raise a Dispute"
        description="Send the issue and supporting evidence for admin review."
        maxWidth="lg"
      >
        <div className="space-y-5 pt-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-ink" htmlFor="dispute-reason">
              Reason
            </label>
            <Textarea
              id="dispute-reason"
              data-testid="dispute-reason-input"
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
            <label className="text-xs font-semibold text-ink" htmlFor="dispute-evidence">
              Evidence
            </label>
            <Textarea
              id="dispute-evidence"
              data-testid="dispute-evidence-input"
              rows={5}
              value={disputeEvidence}
              onChange={(event) => {
                setDisputeEvidence(event.target.value);
                setDisputeError(null);
              }}
              placeholder="Add timelines, message summaries, deliverable notes, or payment context."
            />
            {disputeError && (
              <p className="text-xs font-medium text-red-600" data-testid="dispute-error">
                {disputeError}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" size="sm" onClick={() => setDisputeModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              icon={Gavel}
              onClick={handleRaiseDispute}
              disabled={submittingDispute}
              data-testid="submit-dispute"
            >
              Submit Dispute
            </Button>
          </div>
        </div>
      </Modal>

      {/* Invoice modal. `.print-area` + the print stylesheet in index.css
          isolate this block so window.print() prints only the invoice —
          not the sidebar, the page behind it, or the modal's own
          Print/Close buttons (marked `.no-print`). */}
      <Modal
        isOpen={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title="Invoice"
        description="A summary of this booking, for your records."
        maxWidth="xl"
      >
        <div className="space-y-6 pt-2 text-xs">
          <div className="print-area p-8 bg-white text-ink border border-border rounded-2xl shadow-xs space-y-6">
            <div className="flex justify-between items-start pb-6 border-b border-border">
              <div>
                <span className="text-xl font-black tracking-tight">MARCHÉ</span>
                <p className="text-[10px] text-ink-muted mt-1">Event services marketplace</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold uppercase tracking-wide">Invoice</p>
                <p className="text-[10px] font-mono text-ink-muted mt-1">Ref. {c.id}</p>
                <p className="text-[10px] text-ink-muted">Issued {formatDate(c.createdAt)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <span className="text-[10px] font-mono uppercase text-ink-muted">Billed to</span>
                <p className="font-bold mt-0.5">{c.clientProfile.displayName}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono uppercase text-ink-muted">
                  Service provider
                </span>
                <p className="font-bold mt-0.5">{c.providerProfile.displayName}</p>
              </div>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-[10px] font-mono uppercase text-ink-muted font-semibold">
                    Description
                  </th>
                  <th className="pb-2 text-[10px] font-mono uppercase text-ink-muted font-semibold text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-3 align-top">
                    <p className="font-semibold">{c.job.title}</p>
                    {c.job.eventDate && (
                      <p className="text-ink-muted">{formatDate(c.job.eventDate)}</p>
                    )}
                    {c.job.location && <p className="text-ink-muted">{c.job.location}</p>}
                  </td>
                  <td className="py-3 text-right font-mono align-top">
                    ₹{amount.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-48 space-y-1.5">
                <div className="flex justify-between text-ink-muted">
                  <span>Subtotal</span>
                  <span className="font-mono">₹{amount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-ink-muted">
                  <span>Marché fee</span>
                  {/* Not a stub — the platform charges 0% commission in
                      Phase 1. There is no fee to compute. */}
                  <span className="font-mono">₹0</span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-1.5 border-t border-border">
                  <span>Total</span>
                  <span className="font-mono">₹{amount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <span className="text-[10px] font-mono uppercase text-ink-muted">Status</span>
              <StatusBadge status={c.status} />
            </div>

            <p className="text-[10px] text-ink-muted italic leading-relaxed pt-4 border-t border-border">
              Non-fiscal document — a record of the amount agreed between the parties for this
              booking. It does not replace a formal tax invoice; Marché does not currently issue or
              process payments for this booking.
            </p>
          </div>

          <div className="no-print flex justify-end gap-3 pt-2">
            <Button variant="outline" size="sm" icon={Printer} onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
            <Button size="sm" onClick={() => setInvoiceOpen(false)}>
              Close View
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
