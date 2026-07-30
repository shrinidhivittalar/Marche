import React, { useState } from 'react';
import {
  ArrowLeft,
  DollarSign,
  Send,
  Plus,
  Trash2,
  Sparkles,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card, Input, Textarea } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { formatEventSchedule } from '../../lib/formatTime';

interface SubmitProposalPageProps {
  jobId: string;
}

export const SubmitProposalPage: React.FC<SubmitProposalPageProps> = ({
  jobId,
}) => {
  const { getJobById, submitProposal, navigate } = useApp();

  const job = getJobById(jobId);

  // Form State
  const [bidAmount, setBidAmount] = useState<number>(job?.budgetMin || 3200);
  const [proposedStartTime, setProposedStartTime] = useState<string>(
    job?.eventStartTime || '18:00'
  );
  const [proposedEndTime, setProposedEndTime] = useState<string>(
    job?.eventEndTime || '22:00'
  );
  const [estimatedDelivery, setEstimatedDelivery] = useState<string>('48 Hours');
  const [coverLetter, setCoverLetter] = useState<string>(
    'Hello. I have extensive experience providing top-tier event services for similar high-profile gatherings. My team will ensure full coverage, rapid asset turnaround, and professional execution.'
  );

  const [milestones, setMilestones] = useState<
    { title: string; amount: number; description: string }[]
  >([
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
  ]);

  const [msTitle, setMsTitle] = useState('');
  const [msAmount, setMsAmount] = useState<number>(500);
  const [msDesc, setMsDesc] = useState('');

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coverLetter || !bidAmount) return;
    if (job.timingMode === 'fixed' && proposedEndTime <= proposedStartTime) return;

    submitProposal({
      jobId: job.id,
      bidAmount,
      coverLetter,
      estimatedDelivery,
      proposedStartTime: job.timingMode === 'fixed' ? proposedStartTime : undefined,
      proposedEndTime: job.timingMode === 'fixed' ? proposedEndTime : undefined,
      milestones,
    });

    navigate('/provider/dashboard');
  };

  const milestoneTotal = milestones.reduce((sum, m) => sum + m.amount, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Top Navigation */}
      <button
        onClick={() => navigate(`/provider/jobs/${job.id}`)}
        className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Job Specs</span>
      </button>

      {/* Header */}
      <div>
        <span className="text-xs font-mono uppercase font-semibold text-primary">
          Service Provider Bid Proposal
        </span>
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight mt-1">
          Submit Proposal for "{job.title}"
        </h1>
        <p className="text-xs text-ink-muted mt-1">
          Client Budget: ${job.budgetMin.toLocaleString()} - ${job.budgetMax.toLocaleString()} • {formatEventSchedule(job.eventDate, job.timingMode, job.eventStartTime, job.eventEndTime)}
        </p>
        <p className="text-xs text-amber-700 font-semibold mt-1">
          Submit your proposal by {job.proposalDeadline}.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Proposal Bid Pricing */}
        <Card className="p-8 space-y-6">
          <h2 className="text-lg font-bold text-ink">1. Quote & Timeline</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Your Total Proposed Bid ($)
              </label>
              <Input
                type="number"
                step={50}
                value={bidAmount}
                onChange={(e) => setBidAmount(Number(e.target.value))}
                className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink font-mono font-bold focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Confirmed Event Time
              </label>
              {job.timingMode === 'fixed' ? (
                <>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={proposedStartTime}
                      onChange={(e) => setProposedStartTime(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-xs text-ink focus:outline-none focus:border-primary"
                    />
                    <span className="text-ink-muted text-xs shrink-0">to</span>
                    <Input
                      type="time"
                      value={proposedEndTime}
                      onChange={(e) => setProposedEndTime(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-xs text-ink focus:outline-none focus:border-primary"
                    />
                  </div>
                  {proposedEndTime <= proposedStartTime && (
                    <p className="text-[11px] text-rose-600 mt-1">End time must be after start time.</p>
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

          {/* Pitch Letter */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Cover Letter & Strategy Pitch
            </label>
            <Textarea
              rows={5}
              placeholder="Explain why you are the best talent for this event, your equipment & approach, and past client successes..."
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl p-4 text-xs text-ink focus:outline-none focus:border-primary leading-relaxed"
              required
            />
          </div>
        </Card>

        {/* Milestones Builder */}
        <Card className="p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">2. Proposed Milestones</h2>
            <span className="text-xs font-mono font-bold text-primary">
              Milestones Total: ${milestoneTotal.toLocaleString()} / ${bidAmount.toLocaleString()}
            </span>
          </div>

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
                    ${ms.amount.toLocaleString()}
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
                placeholder="Amount ($)"
                value={msAmount}
                onChange={(e) => setMsAmount(Number(e.target.value))}
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

        {/* Submit Action */}
        <div className="flex justify-end pt-4">
          <Button type="submit" size="lg" icon={Send}>
            Publish Proposal to Client
          </Button>
        </div>
      </form>
    </div>
  );
};
