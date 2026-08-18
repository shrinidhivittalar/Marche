import React, { useState } from 'react';
import { AlertTriangle, Gavel } from 'lucide-react';
import { Button, Card, Textarea } from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { disputesApi, type DisputeStatus } from '../../lib/disputes-api';
import { ApiError } from '../../lib/api';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';

const TABS: { label: string; status: DisputeStatus | undefined }[] = [
  { label: 'Open', status: 'OPEN' },
  { label: 'Under review', status: 'UNDER_REVIEW' },
  { label: 'Resolved', status: 'RESOLVED' },
  { label: 'All', status: undefined },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// The admin queue for Disputes — oldest first, the way DisputesService.listAll
// orders it, since this is worked off like a backlog rather than browsed.
export const AdminDisputesPage: React.FC = () => {
  const { accessToken } = useApp();
  const token = accessToken as string;

  const [statusFilter, setStatusFilter] = useState<DisputeStatus | undefined>('OPEN');
  const disputes = useApiResource(
    () => disputesApi.listAll(token, 1, 50, statusFilter),
    [token, statusFilter],
    { enabled: Boolean(token) },
  );

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openResolveModal = (disputeId: string) => {
    setResolvingId(disputeId);
    setResolution('');
    setResolveError(null);
  };

  const handleResolve = async () => {
    if (!resolvingId) return;
    if (!resolution.trim()) {
      setResolveError('Add a resolution note before resolving.');
      return;
    }
    setSubmitting(true);
    setResolveError(null);
    try {
      await disputesApi.resolve(token, resolvingId, resolution.trim());
      setResolvingId(null);
      await disputes.refetch();
    } catch (error) {
      setResolveError(error instanceof ApiError ? error.message : 'Unable to resolve dispute.');
    } finally {
      setSubmitting(false);
    }
  };

  const items = disputes.data?.items ?? [];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Disputes</h1>
        <p className="text-xs text-ink-muted mt-1">
          Raised by either party on a connection. Resolving is the only admin action — there is no
          override of the connection or job itself.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setStatusFilter(tab.status)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              statusFilter === tab.status
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-surface text-ink-muted hover:text-ink border border-border'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {disputes.loading ? (
        <p className="text-xs text-ink-muted py-12 text-center">Loading disputes…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No disputes here"
          description="Nothing matches this filter."
          icon={Gavel}
        />
      ) : (
        <div className="space-y-4">
          {items.map((dispute) => (
            <Card key={dispute.id} className="p-6 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 font-bold text-sm text-ink">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>{dispute.status.replace('_', ' ')}</span>
                </div>
                <span className="text-[11px] text-ink-muted">
                  Raised {formatDate(dispute.createdAt)} · Connection{' '}
                  {dispute.connectionId.slice(0, 8)}
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-mono uppercase text-ink-muted">Reason</span>
                <p className="text-xs text-ink leading-relaxed">{dispute.reason}</p>
              </div>
              <div>
                <span className="block text-[10px] font-mono uppercase text-ink-muted">
                  Evidence
                </span>
                <p className="text-xs text-ink leading-relaxed">{dispute.evidence}</p>
              </div>

              {dispute.status === 'RESOLVED' ? (
                <div className="p-3 rounded-xl bg-surface-subtle border border-border text-xs">
                  <span className="font-semibold text-ink">Resolution: </span>
                  <span className="text-ink-muted">{dispute.resolution}</span>
                  {dispute.resolvedAt && (
                    <span className="block text-[11px] text-ink-muted mt-1">
                      Resolved {formatDate(dispute.resolvedAt)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    icon={Gavel}
                    onClick={() => openResolveModal(dispute.id)}
                    data-testid="resolve-dispute"
                  >
                    Resolve
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={resolvingId !== null}
        onClose={() => setResolvingId(null)}
        title="Resolve Dispute"
        description="This is final — there is no reopening a resolved dispute."
      >
        <div className="space-y-4 pt-2 text-xs">
          <Textarea
            data-testid="resolution-input"
            rows={4}
            placeholder="e.g. Refunded the deposit; provider agreed to the cancellation."
            value={resolution}
            onChange={(e) => {
              setResolution(e.target.value);
              setResolveError(null);
            }}
          />
          {resolveError && <p className="text-red-600 font-medium">{resolveError}</p>}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setResolvingId(null)}>
              Cancel
            </Button>
            <Button onClick={handleResolve} disabled={submitting || !resolution.trim()}>
              Mark Resolved
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
