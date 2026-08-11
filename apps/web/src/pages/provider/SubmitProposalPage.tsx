import React, { useState } from 'react';
import {
  ArrowLeft,
  IndianRupee,
  Send,
  Calendar as CalendarIcon,
  MapPin,
  Paperclip,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card, Input, Textarea } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useApiResource } from '../../hooks/useApiResource';
import { jobsApi } from '../../lib/jobs-api';
import { proposalsApi } from '../../lib/proposals-api';
import { ApiError } from '../../lib/api';
import {
  formatJobBudget,
  formatEventWhen,
  formatDeadline,
  isPastProposalDeadline,
} from '../../lib/formatJob';

// Submitting a proposal, on the real Proposals API.
//
// Most of what this screen used to collect has no home in Phase 1 and was
// removed rather than left collecting values nothing reads:
//
// - Drafts. A proposal is submitted complete, in one operation — there is no
//   DRAFT status, so "Save as Draft" wrote to mock state and nothing else.
// - Milestones and the service-fee breakdown. Both belong to Contracts and
//   Payments, neither of which exists. The fee in particular was inventing a
//   number the platform has never charged.
// - Proposed event times. The client names the hours on the requirement;
//   a provider countering them is negotiation, which Phase 1 does not have.
// - Portfolio highlights. The provider's profile is already reachable from
//   the proposal, so selecting images duplicated it against mock portfolio
//   rows that no real proposal could reference.
//
// What is left is exactly what the API accepts: a price, a turnaround in
// days, and a cover message.

interface SubmitProposalPageProps {
  jobId: string;
}

// Matches the DTO. Enforced server-side too — this only saves a round trip
// and gives the provider the message before they lose their typing.
const MIN_COVER_MESSAGE = 20;
const MAX_COVER_MESSAGE = 3000;
const MAX_PRICE = 10000000;

export const SubmitProposalPage: React.FC<SubmitProposalPageProps> = ({ jobId }) => {
  const { navigate, goBack, accessToken } = useApp();

  const job = useApiResource(() => jobsApi.byId(jobId), [jobId]);

  const [proposedPrice, setProposedPrice] = useState<string>('');
  const [deliveryDays, setDeliveryDays] = useState<string>('7');
  const [coverMessage, setCoverMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Only the deadline is checked here, and only as a courtesy — the server
  // decides on every submission anyway. There is deliberately no check for
  // cancelled or filled: this page reads the *public* requirement route, so
  // a requirement in either state is already a 404 above, indistinguishable
  // from one that never existed. That is the API's rule, not an oversight,
  // and a status branch here would be code that can never run.
  const closed = isPastProposalDeadline(requirement);

  const price = Number(proposedPrice);
  const days = Number(deliveryDays);
  const message = coverMessage.trim();

  const priceValid =
    proposedPrice !== '' &&
    Number.isFinite(price) &&
    price >= 0 &&
    price <= MAX_PRICE &&
    /^\d+(\.\d{1,2})?$/.test(proposedPrice.trim());
  const daysValid = Number.isInteger(days) && days >= 1 && days <= 365;
  const messageValid = message.length >= MIN_COVER_MESSAGE && message.length <= MAX_COVER_MESSAGE;
  const canSubmit = !closed && priceValid && daysValid && messageValid && !submitting;

  // A hint, not a block. The client's range is guidance and the API accepts
  // a bid outside it, so refusing to send one would make this screen stricter
  // than the platform — and a provider who is genuinely worth more than the
  // stated budget should be able to say so.
  const outsideBudget =
    priceValid &&
    ((requirement.budgetMin !== null && price < Number(requirement.budgetMin)) ||
      (requirement.budgetMax !== null && price > Number(requirement.budgetMax)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !accessToken) return;

    setSubmitting(true);
    setError(null);
    try {
      const proposal = await proposalsApi.submit(accessToken, {
        jobId: requirement.id,
        coverMessage: message,
        proposedPrice: price,
        deliveryDays: days,
      });
      navigate(`/provider/proposals/${proposal.id}`);
    } catch (err) {
      // The 409s carry a real explanation — already proposed, withdrawal was
      // final, deadline passed, requirement filled while the form was open —
      // so the server's message is shown rather than replaced with a generic
      // failure.
      setError(
        err instanceof ApiError
          ? err.message
          : "We couldn't reach the server. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <button
        onClick={goBack}
        className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      <div>
        <span className="text-xs font-mono uppercase font-semibold text-primary">Proposal</span>
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight mt-1">
          Submit a proposal for “{requirement.title}”
        </h1>
        <p className="text-xs text-ink-muted mt-1">{formatDeadline(requirement)}</p>
      </div>

      {closed && (
        <Card className="p-5 border-amber-300 bg-amber-50" data-testid="proposals-closed">
          <p className="text-xs font-semibold text-amber-900">
            The deadline for proposals on this requirement has passed.
          </p>
          <p className="text-[11px] text-amber-800 mt-1">
            You can still read it, but nothing you send would reach the client.
          </p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-8 space-y-4">
          <h2 className="text-lg font-bold text-ink">The requirement</h2>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-8">
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-bold text-ink">{requirement.title}</h3>
                <span className="inline-block mt-1.5 px-2.5 py-1 rounded-lg bg-surface-subtle text-[11px] font-medium text-ink-muted border border-border">
                  {requirement.category.name}
                </span>
              </div>

              <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-line">
                {requirement.description}
              </p>

              {requirement.deliverables.length > 0 && (
                <ul className="text-xs text-ink-muted list-disc pl-4 space-y-1">
                  {requirement.deliverables.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => navigate(`/provider/jobs/${requirement.id}`)}
                className="text-xs text-primary font-semibold hover:underline cursor-pointer"
              >
                View the full posting
              </button>
            </div>

            <div className="space-y-3 md:border-l md:border-border md:pl-6">
              <div className="flex items-start gap-2.5">
                <IndianRupee className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-ink">{formatJobBudget(requirement)}</p>
                  <p className="text-[11px] text-ink-muted">Client’s budget</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CalendarIcon className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-ink">{formatEventWhen(requirement)}</p>
                  <p className="text-[11px] text-ink-muted">Event timing</p>
                </div>
              </div>
              {requirement.location && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-ink">{requirement.location}</p>
                    <p className="text-[11px] text-ink-muted">Location</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-ink">Your offer</h2>
            <p className="text-xs text-ink-muted mt-1">
              This is a snapshot. Once submitted it cannot be edited — only withdrawn — so the
              client decides on exactly what they read.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="proposedPrice" className="block text-xs font-semibold text-ink mb-1">
                Your price
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-ink-muted">
                  ₹
                </span>
                <Input
                  id="proposedPrice"
                  data-testid="proposal-price-input"
                  type="number"
                  min={0}
                  step={50}
                  value={proposedPrice}
                  onChange={(e) => setProposedPrice(e.target.value)}
                  placeholder="25000"
                  className="w-full bg-bg border border-border rounded-xl pl-7 pr-4 py-2.5 text-xs text-ink font-mono font-bold focus:outline-none focus:border-primary"
                  required
                />
              </div>
              <p className="text-[11px] mt-1.5 text-ink-muted">
                {outsideBudget
                  ? `Outside the client’s stated budget (${formatJobBudget(requirement)}). You can still send it.`
                  : `The client’s budget is ${formatJobBudget(requirement)}.`}
              </p>
            </div>

            <div>
              <label htmlFor="deliveryDays" className="block text-xs font-semibold text-ink mb-1">
                Turnaround, in days
              </label>
              <Input
                id="deliveryDays"
                data-testid="proposal-days-input"
                type="number"
                min={1}
                max={365}
                step={1}
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-ink font-mono font-bold focus:outline-none focus:border-primary"
                required
              />
              <p className="text-[11px] text-ink-muted mt-1.5">
                Working days from the event to final delivery.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="coverMessage" className="block text-xs font-semibold text-ink mb-1">
              Cover message
            </label>
            <Textarea
              id="coverMessage"
              data-testid="proposal-message-input"
              rows={6}
              placeholder="Why you are right for this event, your approach and equipment, and comparable work you have done…"
              value={coverMessage}
              onChange={(e) => setCoverMessage(e.target.value)}
              maxLength={MAX_COVER_MESSAGE}
              className="w-full bg-bg border border-border rounded-xl p-4 text-xs text-ink focus:outline-none focus:border-primary leading-relaxed"
              required
            />
            <p className="text-[11px] text-ink-muted mt-1.5">
              {message.length < MIN_COVER_MESSAGE
                ? `${MIN_COVER_MESSAGE - message.length} more characters needed.`
                : `${message.length} / ${MAX_COVER_MESSAGE} characters.`}
            </p>
          </div>

          {/* Files come after submission, not before: the API attaches them to
              a proposal that already exists, so there is nothing to attach
              them to until this form is sent. */}
          <div className="p-4 bg-bg border border-border rounded-xl flex items-start gap-2.5">
            <Paperclip className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
            <p className="text-[11px] text-ink-muted leading-relaxed">
              You can attach work samples or documents once the proposal is submitted. Your Marché
              profile goes to the client with it, so there is no need to attach a résumé.
            </p>
          </div>
        </Card>

        {error && (
          <Card className="p-5 border-destructive/40 bg-destructive/5" data-testid="proposal-error">
            <p className="text-xs font-semibold text-destructive">{error}</p>
          </Card>
        )}

        <div className="flex items-center gap-4 pt-2">
          <Button
            type="submit"
            size="lg"
            icon={Send}
            data-testid="submit-proposal"
            disabled={!canSubmit}
          >
            {submitting ? 'Submitting…' : 'Submit proposal'}
          </Button>
          <button
            type="button"
            onClick={() => navigate(`/provider/jobs/${requirement.id}`)}
            className="text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
