import React, { useState } from 'react';
import { ArrowRightLeft, Check, X, Undo2 } from 'lucide-react';
import { Button, Card, Input } from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { usePolling } from '../../hooks/usePolling';
import { priceNegotiationsApi, type PriceNegotiationStatus } from '../../lib/proposals-api';
import { ApiError } from '../../lib/api';

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const STATUS_LABEL: Record<PriceNegotiationStatus, string> = {
  PROPOSED: 'Pending',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

interface PriceNegotiationPanelProps {
  proposalId: string;
  /**
   * The profile id of whichever party this viewer is NOT — the provider's,
   * on the client's own screen; the client's, on the provider's own screen.
   * Comparing a round's proposedByProfileId against this is how the panel
   * tells "my round" from "their round" without needing the viewer's own
   * profile id at all.
   */
  otherPartyProfileId: string;
  /** Only an open (SUBMITTED) proposal can be negotiated further. */
  canPropose: boolean;
}

// Shared by both ProposalDetailPage (client) and ProposalDetailProviderView
// (provider) — the history and the propose/accept/reject/withdraw actions
// read identically for either party, just with "mine" and "theirs" swapped,
// which otherPartyProfileId alone is enough to express.
export const PriceNegotiationPanel: React.FC<PriceNegotiationPanelProps> = ({
  proposalId,
  otherPartyProfileId,
  canPropose,
}) => {
  const { accessToken } = useApp();
  const token = accessToken as string;

  const negotiations = useApiResource(
    () => priceNegotiationsApi.list(token, proposalId),
    [token, proposalId],
    { enabled: Boolean(token) },
  );
  // The other party's own proposes/accepts/rejects don't otherwise reach
  // this screen — refetch-on-own-action only covers what the viewer does.
  // Same interval as messaging/payments/notifications elsewhere in the app.
  usePolling(negotiations.refetch, Boolean(token));

  const [proposing, setProposing] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = (err: unknown) =>
    err instanceof ApiError
      ? err.message
      : "We couldn't reach the server. Check your connection and try again.";

  const rounds = negotiations.data ?? [];
  const pending = rounds.find((n) => n.status === 'PROPOSED') ?? null;
  const pendingIsMine = pending ? pending.proposedByProfileId !== otherPartyProfileId : false;

  const handlePropose = async () => {
    const amount = Number(amountInput);
    if (!amountInput.trim() || !Number.isFinite(amount) || amount < 0) {
      setError('Enter a valid amount.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await priceNegotiationsApi.propose(token, proposalId, amount);
      setProposing(false);
      setAmountInput('');
      await negotiations.refetch();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const respond = async (action: 'accept' | 'reject' | 'withdraw', negotiationId: string) => {
    setBusy(true);
    setError(null);
    try {
      await priceNegotiationsApi[action](token, proposalId, negotiationId);
      await negotiations.refetch();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  if (negotiations.loading) {
    return <p className="text-xs text-ink-muted">Loading price history…</p>;
  }

  return (
    <Card className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-primary" />
          Price negotiation
        </h2>
      </div>

      {rounds.length === 0 && !proposing && (
        <p className="text-xs text-ink-muted">No price changes have been proposed yet.</p>
      )}

      {rounds.length > 0 && (
        <div className="space-y-2">
          {rounds.map((round) => {
            const mine = round.proposedByProfileId !== otherPartyProfileId;
            return (
              <div
                key={round.id}
                className="flex items-center justify-between gap-3 p-3 bg-bg border border-border rounded-xl text-xs"
              >
                <div>
                  <p className="font-mono font-bold text-ink">
                    {rupees.format(Number(round.amount))}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {mine ? 'You' : round.proposedByProfile.displayName} proposed ·{' '}
                    {dateTimeFormat.format(new Date(round.createdAt))}
                  </p>
                </div>
                <span
                  data-testid="negotiation-status"
                  data-status={round.status}
                  className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                    round.status === 'ACCEPTED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : round.status === 'PROPOSED'
                        ? 'bg-sky-50 text-sky-700 border-sky-200'
                        : 'bg-surface-subtle text-ink-muted border-border'
                  }`}
                >
                  {STATUS_LABEL[round.status]}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

      {pending &&
        (pendingIsMine ? (
          <div className="flex items-center gap-3">
            <p className="text-xs text-ink-muted flex-1">
              Waiting for a response to your proposed {rupees.format(Number(pending.amount))}.
            </p>
            <Button
              variant="outline"
              size="sm"
              icon={Undo2}
              disabled={busy}
              data-testid="withdraw-negotiation"
              onClick={() => void respond('withdraw', pending.id)}
            >
              Withdraw
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-xs text-ink-muted flex-1">
              Respond to the proposed {rupees.format(Number(pending.amount))}.
            </p>
            <Button
              size="sm"
              icon={Check}
              disabled={busy}
              data-testid="accept-negotiation"
              onClick={() => void respond('accept', pending.id)}
            >
              Accept
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={X}
              disabled={busy}
              data-testid="reject-negotiation"
              onClick={() => void respond('reject', pending.id)}
            >
              Reject
            </Button>
          </div>
        ))}

      {!pending && canPropose && (
        <>
          {proposing ? (
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                step={100}
                autoFocus
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="New amount (₹)"
                data-testid="negotiation-amount-input"
                className="font-mono max-w-[200px]"
              />
              <Button
                size="sm"
                disabled={busy}
                data-testid="submit-negotiation"
                onClick={() => void handlePropose()}
              >
                {busy ? 'Sending…' : 'Send'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setProposing(false);
                  setError(null);
                }}
                className="text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              icon={ArrowRightLeft}
              data-testid="propose-negotiation"
              onClick={() => setProposing(true)}
            >
              Propose a different price
            </Button>
          )}
        </>
      )}
    </Card>
  );
};
