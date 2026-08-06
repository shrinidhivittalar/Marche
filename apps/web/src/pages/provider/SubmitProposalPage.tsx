import React, { useState } from 'react';
import {
  ArrowLeft,
  IndianRupee,
  Lock,
  Send,
  Trash2,
  CheckCircle2,
  Calendar as CalendarIcon,
  MapPin,
  ShieldCheck,
  Paperclip,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card, Input, Textarea, TimePicker } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { formatEventSchedule } from '../../lib/formatTime';
import { formatBudget, isBidWithinBudget } from '../../lib/formatBudget';
import { INITIAL_PORTFOLIO_ITEMS } from '../../data/mockData';

interface SubmitProposalPageProps {
  jobId: string;
}

const MARCHE_SERVICE_FEE_RATE = 0.1;
const MAX_HIGHLIGHTS = 4;
const DESCRIPTION_TRUNCATE_LENGTH = 180;
const DEFAULT_BID_AMOUNT = 3200;

export const SubmitProposalPage: React.FC<SubmitProposalPageProps> = ({ jobId }) => {
  const {
    currentUser,
    proposals,
    getJobById,
    submitProposal,
    saveProposalDraft,
    navigate,
    goBack,
  } = useApp();

  const job = getJobById(jobId);
  const existingDraft = proposals.find(
    (p) => p.jobId === jobId && p.vendorId === currentUser.id && p.status === 'draft',
  );

  const [currentDraftId, setCurrentDraftId] = useState<string | null>(existingDraft?.id ?? null);

  // Form State — pre-filled from an existing draft proposal when resuming one
  const [bidAmount, setBidAmount] = useState<number>(
    existingDraft?.bidAmount ?? job?.budgetMin ?? DEFAULT_BID_AMOUNT,
  );
  const [proposedStartTime, setProposedStartTime] = useState<string>(
    existingDraft?.proposedStartTime ?? job?.eventStartTime ?? '18:00',
  );
  const [proposedEndTime, setProposedEndTime] = useState<string>(
    existingDraft?.proposedEndTime ?? job?.eventEndTime ?? '22:00',
  );
  const [estimatedDelivery, setEstimatedDelivery] = useState<string>(
    existingDraft?.estimatedDelivery ?? '48 Hours',
  );
  const [coverLetter, setCoverLetter] = useState<string>(
    existingDraft?.coverLetter ??
      'Hello. I have extensive experience providing top-tier event services for similar high-profile gatherings. My team will ensure full coverage, rapid asset turnaround, and professional execution.',
  );
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>(
    existingDraft?.portfolioLinks ?? [],
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [milestones, setMilestones] = useState<
    { title: string; amount: number; description: string }[]
  >(
    existingDraft?.milestones.map((m) => ({
      title: m.title,
      amount: m.amount,
      description: m.description,
    })) ?? [
      {
        title: 'Event On-Site Setup & Equipment Prep',
        amount: Math.round(bidAmount * 0.3),
        description: 'Arrival 2 hours prior to start, equipment calibration & survey.',
      },
      {
        title: 'Live Event Execution & Primary Deliverable',
        amount: Math.round(bidAmount * 0.5),
        description: 'On-site execution during selected date and time slot.',
      },
      {
        title: 'Post-Production & Final Master Delivery',
        amount: Math.round(bidAmount * 0.2),
        description: 'High-res color grading, editing, and commercial usage licensing.',
      },
    ],
  );

  const [msTitle, setMsTitle] = useState('');
  const [msAmount, setMsAmount] = useState<number>(500);
  const [msDesc, setMsDesc] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          title="Job Not Found"
          description="The requested job is unavailable."
          actionLabel="Browse Marketplace"
          onAction={() => navigate('/provider/dashboard')}
        />
      </div>
    );
  }

  // Fixed-budget jobs only accept one bid amount — derive the effective value
  // instead of syncing bidAmount state to it, so a stale draft or a later job
  // edit can never leave the two out of sync.
  const effectiveBidAmount = job.budgetMode === 'fixed' ? job.budgetMin : bidAmount;

  const bidOutOfRange = !isBidWithinBudget(job, effectiveBidAmount);
  const milestoneTotal = milestones.reduce((sum, m) => sum + m.amount, 0);
  const milestonesMismatch = milestones.length > 0 && milestoneTotal !== effectiveBidAmount;

  const portfolioItems = INITIAL_PORTFOLIO_ITEMS.filter((p) => p.vendorId === currentUser.id);

  const toggleHighlight = (image: string) => {
    setSelectedHighlights((prev) => {
      if (prev.includes(image)) return prev.filter((img) => img !== image);
      if (prev.length >= MAX_HIGHLIGHTS) {
        showToast(`You can only select up to ${MAX_HIGHLIGHTS} highlights.`);
        return prev;
      }
      return [...prev, image];
    });
  };

  const handleAddMilestone = () => {
    if (msTitle.trim()) {
      setMilestones([
        ...milestones,
        { title: msTitle.trim(), amount: msAmount, description: msDesc.trim() },
      ]);
      setMsTitle('');
      setMsDesc('');
    }
  };

  const handleRemoveMilestone = (idx: number) => {
    setMilestones(milestones.filter((_, i) => i !== idx));
  };

  const buildProposalData = () => ({
    jobId: job.id,
    bidAmount: effectiveBidAmount,
    coverLetter,
    estimatedDelivery,
    proposedStartTime: job.timingMode === 'fixed' ? proposedStartTime : undefined,
    proposedEndTime: job.timingMode === 'fixed' ? proposedEndTime : undefined,
    milestones,
    portfolioLinks: selectedHighlights.length > 0 ? selectedHighlights : undefined,
  });

  const handleSaveDraft = () => {
    const saved = saveProposalDraft(currentDraftId, buildProposalData());
    setCurrentDraftId(saved.id);
    showToast('Draft saved. You can find it on your Dashboard.');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coverLetter || !effectiveBidAmount) return;
    if (job.timingMode === 'fixed' && proposedEndTime <= proposedStartTime) return;
    if (bidOutOfRange) return;
    if (milestonesMismatch) return;

    try {
      submitProposal({
        ...buildProposalData(),
        draftId: currentDraftId ?? undefined,
      });
      navigate('/provider/dashboard');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not submit this proposal.');
    }
  };

  const serviceFee = Math.round(effectiveBidAmount * MARCHE_SERVICE_FEE_RATE * 100) / 100;
  const youReceive = effectiveBidAmount - serviceFee;

  const descriptionIsLong = job.description.length > DESCRIPTION_TRUNCATE_LENGTH;
  const displayedDescription =
    descriptionIsLong && !descriptionExpanded
      ? `${job.description.slice(0, DESCRIPTION_TRUNCATE_LENGTH).trimEnd()}…`
      : job.description;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {toastMessage && (
        <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation */}
      <button
        onClick={goBack}
        className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      {/* Header */}
      <div>
        <span className="text-xs font-mono uppercase font-semibold text-primary">
          Service Provider Bid Proposal{currentDraftId ? ' · Editing Draft' : ''}
        </span>
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight mt-1">
          Submit Proposal for "{job.title}"
        </h1>
        <p className="text-xs text-amber-700 font-semibold mt-1">
          Submit your proposal by {job.proposalDeadline}.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Job Details Recap */}
        <Card className="p-8 space-y-4">
          <h2 className="text-lg font-bold text-ink">Job details</h2>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-8">
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-bold text-ink">{job.title}</h3>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="px-2.5 py-1 rounded-lg bg-surface-subtle text-[11px] font-medium text-ink-muted border border-border">
                    {job.category}
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    Posted{' '}
                    {new Date(job.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              <p className="text-xs text-ink-muted leading-relaxed">
                {displayedDescription}{' '}
                {descriptionIsLong && (
                  <button
                    type="button"
                    onClick={() => setDescriptionExpanded((v) => !v)}
                    className="text-primary font-semibold hover:underline cursor-pointer"
                  >
                    {descriptionExpanded ? 'less' : 'more'}
                  </button>
                )}
              </p>

              <button
                type="button"
                onClick={() => navigate(`/provider/jobs/${job.id}`)}
                className="text-xs text-primary font-semibold hover:underline cursor-pointer"
              >
                View job posting
              </button>
            </div>

            <div className="space-y-3 md:border-l md:border-border md:pl-6">
              <div className="flex items-start gap-2.5">
                <IndianRupee className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-ink">{formatBudget(job)}</p>
                  <p className="text-[11px] text-ink-muted">
                    {job.budgetMode === 'fixed' ? 'Fixed budget' : 'Budget range'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CalendarIcon className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-ink">
                    {formatEventSchedule(
                      job.eventDate,
                      job.timingMode,
                      job.eventStartTime,
                      job.eventEndTime,
                    )}
                  </p>
                  <p className="text-[11px] text-ink-muted">Event timing</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-ink">{job.location}</p>
                  <p className="text-[11px] text-ink-muted">Location</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Terms: Bid & Fee Breakdown */}
        <Card className="p-8 space-y-6">
          <h2 className="text-lg font-bold text-ink">Terms</h2>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-8">
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  What's your total bid for this job?
                </label>
                {job.budgetMode === 'fixed' ? (
                  <>
                    <div className="relative max-w-xs">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-ink-muted">
                        ₹
                      </span>
                      <Input
                        type="number"
                        value={effectiveBidAmount}
                        disabled
                        className="w-full bg-bg border border-border rounded-xl pl-7 pr-9 py-2.5 text-xs text-ink font-mono font-bold disabled:opacity-100 disabled:cursor-not-allowed"
                      />
                      <Lock className="w-3.5 h-3.5 text-ink-muted absolute right-4 top-1/2 -translate-y-1/2" />
                    </div>
                    <p className="text-[11px] text-ink-muted mt-1.5">
                      This client set a fixed budget — bids are locked to this exact amount.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="relative max-w-xs">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-ink-muted">
                        ₹
                      </span>
                      <Input
                        type="number"
                        step={50}
                        min={job.budgetMin}
                        max={job.budgetMax}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(Math.max(0, Number(e.target.value)))}
                        className="w-full bg-bg border border-border rounded-xl pl-7 pr-4 py-2.5 text-xs text-ink font-mono font-bold focus:outline-none focus:border-primary"
                        aria-invalid={bidOutOfRange}
                        required
                      />
                    </div>
                    {bidOutOfRange ? (
                      <p className="text-[11px] text-destructive mt-1.5 font-medium">
                        Your bid must be within the client's budget range ({formatBudget(job)}).
                      </p>
                    ) : (
                      <p className="text-[11px] text-ink-muted mt-1.5">
                        Must fall within the client's budget range ({formatBudget(job)}).
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Confirmed Event Time
                  </label>
                  {job.timingMode === 'fixed' ? (
                    <>
                      <div className="flex items-center gap-2">
                        <TimePicker
                          value={proposedStartTime}
                          onChange={setProposedStartTime}
                          className="bg-bg h-auto py-2.5 text-xs"
                        />
                        <span className="text-ink-muted text-xs shrink-0">to</span>
                        <TimePicker
                          value={proposedEndTime}
                          onChange={setProposedEndTime}
                          className="bg-bg h-auto py-2.5 text-xs"
                        />
                      </div>
                      {proposedEndTime <= proposedStartTime && (
                        <p className="text-[11px] text-rose-600 mt-1">
                          End time must be after start time.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-xs text-ink-muted">
                      Flexible — deliver by {job.eventDate}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Estimated Delivery Turnaround
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. 24 Hours / 48 Hours"
                    value={estimatedDelivery}
                    onChange={(e) => setEstimatedDelivery(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-bg border border-border rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <div>
                    <span className="text-ink">
                      Marché Service Fee: {(MARCHE_SERVICE_FEE_RATE * 100).toFixed(0)}%
                    </span>
                    <p className="text-[10px] text-ink-muted">Fixed for the entire contract</p>
                  </div>
                  <span className="text-ink-muted shrink-0">
                    -₹{serviceFee.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border">
                  <div>
                    <span className="font-bold text-ink">You'll receive</span>
                    <p className="text-[10px] text-ink-muted">After service fees</p>
                  </div>
                  <span className="font-mono font-bold text-primary shrink-0">
                    ₹{youReceive.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-white border border-border rounded-xl flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                <div className="text-[11px] text-ink-muted leading-relaxed">
                  Includes Marché Booking Protection.{' '}
                  <button
                    type="button"
                    onClick={() =>
                      showToast(
                        "Booking protection details aren't wired up yet — Marché is still a frontend preview.",
                      )
                    }
                    className="text-primary font-semibold hover:underline cursor-pointer"
                  >
                    Learn more
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Milestones Builder */}
        <Card className="p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">Milestone breakdown</h2>
            <span
              className={`text-xs font-mono font-bold ${milestonesMismatch ? 'text-destructive' : 'text-primary'}`}
            >
              Milestones Total: ₹{milestoneTotal.toLocaleString('en-IN')} / ₹
              {effectiveBidAmount.toLocaleString('en-IN')}
            </span>
          </div>
          {milestonesMismatch && (
            <p className="text-[11px] text-destructive font-medium">
              Milestone amounts must add up to your total bid before you can submit.
            </p>
          )}

          <div className="space-y-3">
            {milestones.map((ms, idx) => (
              <div
                key={idx}
                className="p-4 bg-bg border border-border rounded-xl flex items-center justify-between gap-4 text-xs"
              >
                <div>
                  <span className="font-bold text-ink">
                    Milestone {idx + 1}: {ms.title}
                  </span>
                  <p className="text-ink-muted text-[11px] mt-0.5">{ms.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-primary">
                    ₹{ms.amount.toLocaleString('en-IN')}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMilestone(idx)}
                    className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-white border border-border rounded-xl space-y-3">
            <span className="text-xs font-semibold text-ink block">Add Milestone</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                type="text"
                placeholder="Milestone title..."
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                className="bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink"
              />
              <Input
                type="number"
                min={0}
                placeholder="Amount (₹)"
                value={msAmount}
                onChange={(e) => setMsAmount(Math.max(0, Number(e.target.value)))}
                className="bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink"
              />
              <Input
                type="text"
                placeholder="Short description..."
                value={msDesc}
                onChange={(e) => setMsDesc(e.target.value)}
                className="bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink"
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleAddMilestone}>
              Add Milestone
            </Button>
          </div>
        </Card>

        {/* Additional Details */}
        <Card className="p-8 space-y-6">
          <h2 className="text-lg font-bold text-ink">Additional details</h2>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Cover Letter</label>
            <Textarea
              rows={5}
              placeholder="Explain why you are the best talent for this event, your equipment & approach, and past client successes..."
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl p-4 text-xs text-ink focus:outline-none focus:border-primary leading-relaxed"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Attachments</label>
            <button
              type="button"
              onClick={() =>
                showToast("File uploads aren't wired up yet — Marché is still a frontend preview.")
              }
              className="w-full border border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-2 text-xs text-ink-muted hover:border-primary hover:text-primary transition-colors cursor-pointer"
            >
              <Paperclip className="w-4 h-4" />
              <span>
                Drag or <span className="underline font-semibold">upload</span> project files
              </span>
            </button>
            <p className="text-[11px] text-ink-muted mt-2 leading-relaxed">
              You may attach up to 10 files under 25 MB each. Include work samples or other
              documents to support your proposal. Do not attach your resume — your Marché profile is
              automatically forwarded to the client with your proposal.
            </p>
          </div>
        </Card>

        {/* Profile Highlights */}
        <Card className="p-8 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Profile highlights</h2>
            <p className="text-xs text-ink-muted mt-1">
              Highlight relevant work from your profile to include with this proposal. You can add
              up to {MAX_HIGHLIGHTS} highlights.
            </p>
          </div>

          {portfolioItems.length === 0 ? (
            <div className="bg-bg border border-border rounded-2xl py-10 flex items-center justify-center text-center">
              <p className="text-xs text-ink-muted">You don't have any portfolio projects.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {portfolioItems.map((item) => {
                const isSelected = selectedHighlights.includes(item.image);
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => toggleHighlight(item.image)}
                    className={`relative rounded-xl overflow-hidden border-2 text-left cursor-pointer transition-all ${
                      isSelected ? 'border-primary' : 'border-transparent hover:border-border'
                    }`}
                  >
                    <img src={item.image} alt={item.caption} className="w-full h-24 object-cover" />
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      </span>
                    )}
                    <span className="block px-2 py-1.5 text-[10px] font-medium text-ink bg-white truncate">
                      {item.caption}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Submit Action */}
        <div className="flex items-center gap-4 pt-4">
          <Button
            type="submit"
            size="lg"
            icon={Send}
            disabled={bidOutOfRange || milestonesMismatch}
          >
            Submit proposal
          </Button>
          <Button type="button" variant="ghost" onClick={handleSaveDraft}>
            Save as Draft
          </Button>
          <button
            type="button"
            onClick={() => navigate(`/provider/jobs/${job.id}`)}
            className="text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
