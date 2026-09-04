import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  MapPin,
  Paperclip,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { useApiResource } from '../../hooks/useApiResource';
import { proposalsApi, type ApiOwnProposal } from '../../lib/proposals-api';
import { directContractsApi } from '../../lib/direct-contracts-api';
import { mediaApi } from '../../lib/media-api';
import { ApiError } from '../../lib/api';
import { ProposalStatusBadge } from '../../components/proposals/ProposalStatusBadge';
import { PriceNegotiationPanel } from '../../components/proposals/PriceNegotiationPanel';
import {
  formatOffer,
  formatOriginalOffer,
  formatSubmitted,
  formatTurnaround,
} from '../../lib/formatProposal';
import { formatEventWhen, formatDeadline } from '../../lib/formatJob';

// A provider's own proposal.
//
// This screen exists because attachments do: the API attaches a file to a
// proposal that already exists, so there has to be somewhere to do that
// after submitting. It is also where withdrawal lives, which is the only
// change a provider can make to a submitted proposal.

interface ProposalDetailProviderViewProps {
  id: string;
}

const MAX_ATTACHMENTS = 5;

export const ProposalDetailProviderView: React.FC<ProposalDetailProviderViewProps> = ({ id }) => {
  const { navigate, goBack, accessToken } = useApp();
  const token = accessToken as string;

  const proposal = useApiResource(() => proposalsApi.byId<ApiOwnProposal>(token, id), [id, token], {
    enabled: Boolean(token),
  });
  const attachments = useApiResource(() => proposalsApi.attachments(token, id), [id, token], {
    enabled: Boolean(token),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  if (proposal.loading) {
    return <p className="text-xs text-ink-muted py-12 text-center">Loading proposal…</p>;
  }

  if (proposal.error || !proposal.data) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <EmptyState
          title="Proposal not found"
          description={proposal.error ?? 'It may belong to another account.'}
          actionLabel="Your proposals"
          onAction={() => navigate('/provider/analytics')}
        />
      </div>
    );
  }

  const mine = proposal.data;
  const files = attachments.data ?? [];
  // Decided proposals are history: the client acted on what they read, and
  // adding a file afterwards would change it.
  const open = mine.status === 'SUBMITTED';

  const message = (err: unknown) =>
    err instanceof ApiError
      ? err.message
      : "We couldn't reach the server. Check your connection and try again.";

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setError(null);

    const room = MAX_ATTACHMENTS - files.length;
    const chosen = Array.from(fileList).slice(0, room);
    if (fileList.length > room) {
      setError(`A proposal can have at most ${MAX_ATTACHMENTS} attachments.`);
    }

    setBusy(true);
    try {
      for (const file of chosen) {
        // Upload first, attach second. The upload resolves only once the
        // server has verified the file arrived, so anything reaching the
        // attach call is safe to attach.
        const uploaded = await mediaApi.upload(token, file);
        await proposalsApi.addAttachment(token, mine.id, uploaded.mediaId);
      }
      await attachments.refetch();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDetach = async (attachmentId: string) => {
    setBusy(true);
    setError(null);
    try {
      await proposalsApi.removeAttachment(token, mine.id, attachmentId);
      await attachments.refetch();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await proposalsApi.withdraw(token, mine.id);
      await proposal.refetch();
      setConfirmingWithdraw(false);
    } catch (err) {
      // A 409 here means the client decided while this page was open.
      setError(message(err));
      setConfirmingWithdraw(false);
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptOffer = async () => {
    setBusy(true);
    setError(null);
    try {
      const connection = await directContractsApi.accept(token, mine.id);
      navigate(`/contracts/${connection.id}`);
    } catch (err) {
      // A 409 here means the offer was withdrawn or already decided elsewhere.
      setError(message(err));
      setBusy(false);
    }
  };

  const handleDeclineOffer = async () => {
    setBusy(true);
    setError(null);
    try {
      await directContractsApi.decline(token, mine.id);
      await proposal.refetch();
      setConfirmingWithdraw(false);
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
          <span className="text-xs font-mono uppercase font-semibold text-primary">
            Your proposal
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight mt-1">
            {mine.job.title}
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            For {mine.job.clientProfile.displayName} · {formatSubmitted(mine)}
          </p>
        </div>
        <ProposalStatusBadge status={mine.status} />
      </div>

      {mine.status === 'ACCEPTED' && (
        <Card className="p-5 border-emerald-300 bg-emerald-50">
          <p className="text-xs font-semibold text-emerald-900">This proposal was accepted.</p>
          <p className="text-[11px] text-emerald-800 mt-1">
            The requirement is now filled and you are connected to the client.
          </p>
        </Card>
      )}

      {/* The requirement's own facts, before the offer made against them.
          A provider opening an accepted proposal is usually here to check
          the date, not to re-read their own cover message. */}
      <Card className="p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">The requirement</h2>
          <button
            type="button"
            onClick={() => navigate(`/provider/jobs/${mine.job.id}`)}
            className="text-xs text-primary font-semibold hover:underline cursor-pointer"
          >
            View the posting
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="flex items-start gap-2.5">
            <CalendarDays className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-ink">{formatEventWhen(mine.job) ?? 'No date set'}</p>
              <p className="text-[11px] text-ink-muted">Event</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-ink">
                {/* The API includes locationExact only once this provider is
                    the hired one for this job — shown in preference to the
                    coarse label when present. */}
                {(typeof mine.job.locationExact === 'string' ? mine.job.locationExact : null) ??
                  mine.job.locationCoarse ??
                  'Not stated'}
              </p>
              <p className="text-[11px] text-ink-muted">Location</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <CalendarClock className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-ink">{formatDeadline(mine.job) ?? 'None'}</p>
              <p className="text-[11px] text-ink-muted">Proposal deadline</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-8 space-y-6">
        <h2 className="text-lg font-bold text-ink">
          {mine.job.isDirect ? 'What the client offered' : 'What you offered'}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
          <div>
            <p className="text-ink-muted">{mine.job.isDirect ? 'Offered price' : 'Your price'}</p>
            <p className="font-mono font-bold text-ink text-base mt-0.5">{formatOffer(mine)}</p>
            {formatOriginalOffer(mine) && (
              <p className="text-[11px] text-ink-muted mt-0.5">
                Originally {formatOriginalOffer(mine)}, negotiated to {formatOffer(mine)}
              </p>
            )}
          </div>
          <div>
            <p className="text-ink-muted">Turnaround</p>
            <p className="font-bold text-ink text-base mt-0.5">{formatTurnaround(mine)}</p>
          </div>
        </div>

        {!mine.job.isDirect && (
          <div>
            <p className="text-xs text-ink-muted mb-1">Cover message</p>
            <p className="text-xs text-ink leading-relaxed whitespace-pre-line">
              {mine.coverMessage}
            </p>
          </div>
        )}

        {/* Stated plainly rather than left to be discovered by looking for an
            edit button that is not there. */}
        <p className="text-[11px] text-ink-muted">
          {mine.job.isDirect
            ? 'This is a direct offer — decide below whether to accept or decline it.'
            : 'A submitted proposal cannot be edited — the client decides on exactly what they read.'}
        </p>
      </Card>

      {/* Excluded for a direct offer — DirectContractsService already owns
          its single agreed price with its own accept/decline; the backend
          itself refuses price negotiation on an isDirect Job. */}
      {!mine.job.isDirect && (
        <PriceNegotiationPanel
          proposalId={mine.id}
          otherPartyProfileId={mine.job.clientProfile.id}
          canPropose={open}
        />
      )}

      <Card className="p-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Attachments</h2>
          <span className="text-[11px] text-ink-muted">
            {files.length} / {MAX_ATTACHMENTS}
          </span>
        </div>

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((file) => (
              <li
                key={file.id}
                className="p-3 bg-bg border border-border rounded-xl flex items-center justify-between gap-3 text-xs"
              >
                <span className="flex items-center gap-2 min-w-0">
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
                </span>
                {open && (
                  <button
                    type="button"
                    onClick={() => handleDetach(file.id)}
                    disabled={busy}
                    aria-label={`Remove ${file.fileName ?? 'attachment'}`}
                    className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {open ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || files.length >= MAX_ATTACHMENTS}
              className="w-full border border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-2 text-xs text-ink-muted hover:border-primary hover:text-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Paperclip className="w-4 h-4" />
              <span>{busy ? 'Uploading…' : 'Attach a work sample or document'}</span>
            </button>
            <p className="text-[11px] text-ink-muted">
              Only you and this client can open these files.
            </p>
          </>
        ) : (
          files.length === 0 && (
            <p className="text-xs text-ink-muted">No files were attached to this proposal.</p>
          )
        )}
      </Card>

      {error && (
        <Card className="p-5 border-destructive/40 bg-destructive/5">
          <p className="text-xs font-semibold text-destructive">{error}</p>
        </Card>
      )}

      {open && mine.job.isDirect && (
        <Card className="p-8 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Accept or decline</h2>
            <p className="text-xs text-ink-muted mt-1">
              Accepting establishes the connection immediately at the price above. Declining is
              final — the client would need to send a new offer.
            </p>
          </div>

          {confirmingWithdraw ? (
            <div className="flex items-center gap-3">
              <Button
                variant="danger"
                data-testid="confirm-decline-offer"
                onClick={handleDeclineOffer}
                disabled={busy}
              >
                {busy ? 'Declining…' : 'Yes, decline permanently'}
              </Button>
              <button
                type="button"
                onClick={() => setConfirmingWithdraw(false)}
                className="text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer"
              >
                Go back
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button data-testid="accept-offer" onClick={handleAcceptOffer} disabled={busy}>
                {busy ? 'Accepting…' : 'Accept offer'}
              </Button>
              <Button
                variant="outline"
                icon={XCircle}
                data-testid="decline-offer"
                onClick={() => setConfirmingWithdraw(true)}
                disabled={busy}
              >
                Decline
              </Button>
            </div>
          )}
        </Card>
      )}

      {open && !mine.job.isDirect && (
        <Card className="p-8 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Withdraw</h2>
            <p className="text-xs text-ink-muted mt-1">
              Withdrawing is final for this requirement — you will not be able to propose on it
              again.
            </p>
          </div>

          {confirmingWithdraw ? (
            <div className="flex items-center gap-3">
              <Button
                variant="danger"
                data-testid="confirm-withdraw"
                onClick={handleWithdraw}
                disabled={busy}
              >
                {busy ? 'Withdrawing…' : 'Yes, withdraw permanently'}
              </Button>
              <button
                type="button"
                onClick={() => setConfirmingWithdraw(false)}
                className="text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer"
              >
                Keep it
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              icon={XCircle}
              data-testid="withdraw-proposal"
              onClick={() => setConfirmingWithdraw(true)}
            >
              Withdraw proposal
            </Button>
          )}
        </Card>
      )}
    </div>
  );
};
