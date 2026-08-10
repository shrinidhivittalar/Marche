import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Paperclip, ShieldCheck, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card } from '@marche/ui';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { ProposalStatusBadge } from '../../components/proposals/ProposalStatusBadge';
import { useApiResource } from '../../hooks/useApiResource';
import { proposalsApi, type ApiProposal } from '../../lib/proposals-api';
import { ApiError } from '../../lib/api';
import { formatOffer, formatSubmitted, formatTurnaround } from '../../lib/formatProposal';

// One proposal, as the client who received it sees it, on the real API.
//
// The hire flow changed shape with the rewire. It used to create a mock
// contract and route to a contract page; accepting now establishes a
// Connection and nothing more, because Contracts is a later module. Saying
// so is better than routing to a page that would invent one.
//
// Accepting also rejects every competing proposal and fills the requirement,
// in one transaction — so the confirmation says that plainly rather than
// letting the client discover it afterwards.

interface ProposalDetailPageProps {
  id: string;
}

export const ProposalDetailPage: React.FC<ProposalDetailPageProps> = ({ id }) => {
  const { navigate, goBack, accessToken } = useApp();
  const token = accessToken as string;

  const proposal = useApiResource(() => proposalsApi.byId<ApiProposal>(token, id), [id, token], {
    enabled: Boolean(token),
  });
  const attachments = useApiResource(() => proposalsApi.attachments(token, id), [id, token], {
    enabled: Boolean(token),
  });

  const [confirmingHire, setConfirmingHire] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hired, setHired] = useState(false);

  if (proposal.loading) {
    return <p className="text-xs text-ink-muted py-12 text-center">Loading proposal…</p>;
  }

  if (proposal.error || !proposal.data) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          title="Proposal not found"
          description={proposal.error ?? 'It may be on a requirement that is not yours.'}
          actionLabel="Go back"
          onAction={goBack}
        />
      </div>
    );
  }

  const offer = proposal.data;
  const provider = offer.providerProfile;
  const files = attachments.data ?? [];
  const open = offer.status === 'SUBMITTED';

  const message = (err: unknown) =>
    err instanceof ApiError
      ? err.message
      : "We couldn't reach the server. Check your connection and try again.";

  const handleAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      await proposalsApi.accept(token, offer.id);
      setHired(true);
      setConfirmingHire(false);
      await proposal.refetch();
    } catch (err) {
      // The 409 here is the one that matters: the requirement was filled by
      // another acceptance, or this provider withdrew, between opening the
      // page and confirming. The server's wording explains which.
      setError(message(err));
      setConfirmingHire(false);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    setError(null);
    try {
      await proposalsApi.reject(token, offer.id);
      await proposal.refetch();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
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

      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase font-semibold text-primary">Proposal</span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight mt-1">
            {provider.displayName}
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            {provider.headline ? `${provider.headline} · ` : ''}
            {formatSubmitted(offer)}
          </p>
        </div>
        <ProposalStatusBadge status={offer.status} />
      </div>

      {(hired || offer.status === 'ACCEPTED') && (
        <Card className="p-5 border-emerald-300 bg-emerald-50 space-y-1">
          <p className="text-xs font-semibold text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            You hired {provider.displayName}.
          </p>
          <p className="text-[11px] text-emerald-800">
            The requirement is now filled, every other proposal on it has been declined, and you are
            connected to this provider.
          </p>
        </Card>
      )}

      <Card className="p-8 space-y-6">
        <h2 className="text-lg font-bold text-ink">The offer</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
          <div>
            <p className="text-ink-muted">Price</p>
            <p className="font-mono font-bold text-ink text-base mt-0.5">{formatOffer(offer)}</p>
          </div>
          <div>
            <p className="text-ink-muted">Turnaround</p>
            <p className="font-bold text-ink text-base mt-0.5">{formatTurnaround(offer)}</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-ink-muted mb-1">Cover message</p>
          <p className="text-xs text-ink leading-relaxed whitespace-pre-line">
            {offer.coverMessage}
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate(`/profile/${provider.username ?? provider.id}`)}
          className="text-xs text-primary font-semibold hover:underline cursor-pointer"
        >
          View {provider.displayName}’s profile
        </button>
      </Card>

      {files.length > 0 && (
        <Card className="p-8 space-y-4">
          <h2 className="text-lg font-bold text-ink">Attachments</h2>
          <ul className="space-y-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="p-3 bg-bg border border-border rounded-xl flex items-center gap-2 text-xs"
              >
                <Paperclip className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                {file.url ? (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary font-semibold hover:underline truncate"
                  >
                    {file.fileName ?? 'Attachment'}
                  </a>
                ) : (
                  <span className="text-ink-muted truncate">
                    {file.fileName ?? 'Attachment'} (unavailable)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && (
        <Card className="p-5 border-destructive/40 bg-destructive/5">
          <p className="text-xs font-semibold text-destructive">{error}</p>
        </Card>
      )}

      {open && (
        <div className="flex items-center gap-4">
          <Button
            size="lg"
            icon={CheckCircle2}
            data-testid="hire-provider"
            onClick={() => setConfirmingHire(true)}
          >
            Hire {provider.displayName}
          </Button>
          <Button
            variant="outline"
            icon={XCircle}
            data-testid="decline-proposal"
            onClick={handleReject}
            disabled={busy}
          >
            Decline
          </Button>
        </div>
      )}

      <Modal
        isOpen={confirmingHire}
        onClose={() => setConfirmingHire(false)}
        title={`Hire ${provider.displayName}?`}
      >
        <div className="space-y-4 text-xs text-ink-muted">
          <p>
            You are accepting {formatOffer(offer)} for a {formatTurnaround(offer)} turnaround.
          </p>
          {/* Spelled out because it is irreversible and affects other people:
              accepting one proposal declines the rest, in the same
              transaction. A client should not learn that afterwards. */}
          <p>
            This fills the requirement and declines every other proposal on it. It cannot be undone.
          </p>
          <div className="p-3.5 bg-bg border border-border rounded-xl flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Payments and contracts are not part of Marché yet — hiring connects you to the
              provider so you can agree the details directly.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleAccept} data-testid="confirm-hire" disabled={busy}>
              {busy ? 'Confirming…' : 'Confirm hire'}
            </Button>
            <button
              type="button"
              onClick={() => setConfirmingHire(false)}
              className="text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
