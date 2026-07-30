import React, { useState } from 'react';
import {
  ArrowLeft,
  Star,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Calendar,
  Clock,
  MapPin,
  Building,
  DollarSign,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card } from '@marche/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { formatTimeRange } from '../../lib/formatTime';

interface ProposalDetailPageProps {
  id: string;
}

export const ProposalDetailPage: React.FC<ProposalDetailPageProps> = ({ id }) => {
  const { proposals, getJobById, hireVendorAndDepositEscrow, navigate } = useApp();

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [simulatedOutcome, setSimulatedOutcome] = useState<'SUCCESS' | 'FAILURE' | 'TIMEOUT'>('SUCCESS');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const proposal = proposals.find((p) => p.id === id);
  const job = proposal ? getJobById(proposal.jobId) : undefined;

  if (!proposal || !job) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          title="Proposal Not Found"
          description="The requested proposal is unavailable."
          actionLabel="Back to Dashboard"
          onAction={() => navigate('/client/dashboard')}
        />
      </div>
    );
  }

  const handleSimulatePayment = async () => {
    setIsProcessing(true);
    setPaymentError(null);

    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (simulatedOutcome === 'FAILURE') {
      setIsProcessing(false);
      setPaymentError('Simulated payment failed. Escrow remains pending. You may retry or change payment method.');
      return;
    }

    if (simulatedOutcome === 'TIMEOUT') {
      setIsProcessing(false);
      setPaymentError('Simulated gateway request timed out. Booking remains in pending payment window.');
      return;
    }

    try {
      const { contract } = await hireVendorAndDepositEscrow(
        job.id,
        proposal.id
      );
      setIsProcessing(false);
      setPaymentModalOpen(false);
      navigate(`/contracts/${contract.id}`);
    } catch (err) {
      setIsProcessing(false);
      setPaymentError(err instanceof Error ? err.message : 'Payment failed');
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 @container">
      {/* Top Back Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/client/jobs/${job.id}`)}
          className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Job Inbox</span>
        </button>

        <StatusBadge status={proposal.status} />
      </div>

      {/* Main Proposal Container */}
      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-8">
        {/* Left 2 Columns: Pitch & Milestones */}
        <div className="@2xl:col-span-2 space-y-6">
          <Card className="p-8 space-y-6">
            <div className="flex items-start justify-between pb-6 border-b border-border">
              <div className="flex items-center gap-4">
                <img
                  src={proposal.vendorAvatar}
                  alt={proposal.vendorName}
                  className="w-14 h-14 rounded-full object-cover ring-2 ring-border"
                />
                <div>
                  <h1 className="text-xl font-bold text-ink">
                    {proposal.vendorName}
                  </h1>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {proposal.vendorCategory} • {proposal.vendorLocation}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-amber-600 font-semibold mt-1">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span>
                      {proposal.vendorRating} ({proposal.vendorReviewCount} verified client reviews)
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => navigate(`/profile/${proposal.vendorId}`)}
                className="text-xs text-primary font-semibold hover:underline cursor-pointer"
              >
                View Full Profile
              </button>
            </div>

            {/* Cover Letter */}
            <div>
              <h3 className="text-xs font-mono uppercase font-bold text-primary mb-2">
                Proposal Pitch & Strategy
              </h3>
              <p className="text-xs text-ink leading-relaxed whitespace-pre-line bg-bg p-4 border border-border rounded-xl">
                {proposal.coverLetter}
              </p>
            </div>

            {/* Milestones Breakdown */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono uppercase font-bold text-primary">
                Proposed Milestones ({proposal.milestones.length})
              </h3>

              <div className="space-y-3">
                {proposal.milestones.map((ms, idx) => (
                  <div
                    key={ms.id}
                    className="p-4 bg-white border border-border rounded-xl flex items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <span className="font-bold text-ink">
                        Milestone {idx + 1}: {ms.title}
                      </span>
                      <p className="text-ink-muted text-[11px] mt-0.5">{ms.description}</p>
                    </div>
                    <span className="font-mono font-bold text-primary">
                      ${ms.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Portfolio Links */}
            {proposal.portfolioLinks && proposal.portfolioLinks.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-border">
                <h3 className="text-xs font-mono uppercase font-bold text-primary">
                  Portfolio Highlights
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {proposal.portfolioLinks.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt="Portfolio sample"
                      className="w-full h-32 object-cover rounded-xl border border-border"
                    />
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Pricing & Escrow Deposit Action */}
        <div className="space-y-6">
          <Card className="p-6 space-y-6 sticky top-24">
            <div>
              <span className="block text-[10px] font-mono uppercase text-ink-muted">
                Fixed Proposed Quote
              </span>
              <p className="text-3xl font-extrabold text-primary">
                ${proposal.bidAmount.toLocaleString()}
              </p>
              <p className="text-[11px] text-ink-muted mt-1">
                Guaranteed price locked in. No hidden fees.
              </p>
            </div>

            <div className="space-y-2 text-xs border-t border-b border-border py-4">
              <div className="flex justify-between">
                <span className="text-ink-muted">Job:</span>
                <span className="font-medium text-ink truncate max-w-[140px]">
                  {job.title}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Event Date:</span>
                <span className="font-medium text-ink">{job.eventDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Confirmed Time:</span>
                <span className="font-medium text-ink">
                  {proposal.proposedStartTime && proposal.proposedEndTime
                    ? formatTimeRange(proposal.proposedStartTime, proposal.proposedEndTime)
                    : 'Flexible timing'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Estimated Delivery:</span>
                <span className="font-medium text-ink">{proposal.estimatedDelivery}</span>
              </div>
            </div>

            {/* Escrow Guarantee Box */}
            <div className="p-3.5 bg-bg border border-border rounded-xl text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-primary">
                <ShieldCheck className="w-4 h-4" />
                <span>Simulated Escrow Protection</span>
              </div>
              <p className="text-[11px] text-ink-muted leading-relaxed">
                Your payment is held in escrow (<code className="font-mono text-primary">HELD</code>) and released only after you confirm the event was completed satisfactorily.
              </p>
            </div>

            {proposal.status === 'submitted' ? (
              <Button
                size="lg"
                className="w-full"
                icon={Lock}
                onClick={() => setPaymentModalOpen(true)}
              >
                Hire Talent & Deposit Escrow
              </Button>
            ) : proposal.status === 'accepted' ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold text-center">
                Vendor Hired & Escrow Held
              </div>
            ) : (
              <div className="p-3 bg-zinc-100 text-zinc-600 rounded-xl text-xs text-center">
                Proposal {proposal.status}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Simulated Payment Modal */}
      <Modal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="Simulated Payment & Escrow Deposit"
        description="PRD Section 12b: Exercise simulated payment outcomes to test escrow state transitions."
      >
        <div className="space-y-6 pt-2">
          <div className="p-4 bg-bg border border-border rounded-xl space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-ink-muted">Vendor:</span>
              <span className="font-bold text-ink">{proposal.vendorName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Job:</span>
              <span className="font-medium text-ink truncate max-w-[200px]">
                {job.title}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-border font-bold text-sm">
              <span>Total Escrow Hold:</span>
              <span className="text-primary font-mono">
                ${proposal.bidAmount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Test Outcome Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-mono uppercase font-bold text-primary">
              Simulated Payment Outcome (QA Inspector)
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSimulatedOutcome('SUCCESS')}
                className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                  simulatedOutcome === 'SUCCESS'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border bg-white text-ink-muted'
                }`}
              >
                SUCCESS
                <span className="block text-[10px] text-ink-muted font-normal">
                  Sets Escrow to HELD
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSimulatedOutcome('FAILURE')}
                className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                  simulatedOutcome === 'FAILURE'
                    ? 'border-amber-600 bg-amber-50 text-amber-900 font-bold'
                    : 'border-border bg-white text-ink-muted'
                }`}
              >
                FAILURE
                <span className="block text-[10px] text-ink-muted font-normal">
                  Retryable error
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSimulatedOutcome('TIMEOUT')}
                className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                  simulatedOutcome === 'TIMEOUT'
                    ? 'border-rose-600 bg-rose-50 text-rose-900 font-bold'
                    : 'border-border bg-white text-ink-muted'
                }`}
              >
                TIMEOUT
                <span className="block text-[10px] text-ink-muted font-normal">
                  Booking Expires
                </span>
              </button>
            </div>
          </div>

          {paymentError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{paymentError}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={isProcessing}
              onClick={handleSimulatePayment}
              icon={Lock}
            >
              Confirm & Lock ${proposal.bidAmount.toLocaleString()} Escrow
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
