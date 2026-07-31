import React, { useState } from 'react';
import {
  ShieldAlert,
  Layers,
  History,
  AlertTriangle,
  Lock,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card, Input, Textarea } from '@marche/ui';
import { Modal } from '../../components/common/Modal';
import { BookingState } from '../../types';

export const AdminAuditDashboard: React.FC = () => {
  const {
    jobs,
    contracts,
    auditLogs,
    adminOverrideBookingState,
    navigate,
  } = useApp();

  const [selectedBookingId, setSelectedBookingId] = useState<string>('job_101');
  const [overrideTargetState, setOverrideTargetState] = useState<BookingState>('Cancelled');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideModalOpen, setOverrideModalOpen] = useState<boolean>(false);
  const [filterQuery, setFilterQuery] = useState<string>('');

  const filteredAuditLogs = auditLogs.filter(
    (log) =>
      log.action.toLowerCase().includes(filterQuery.toLowerCase()) ||
      log.actorName.toLowerCase().includes(filterQuery.toLowerCase()) ||
      log.targetEntity.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const handleApplyOverride = () => {
    if (!overrideReason.trim()) return;

    adminOverrideBookingState(selectedBookingId, overrideTargetState, overrideReason.trim());
    setOverrideModalOpen(false);
    setOverrideReason('');
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="pb-6 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-mono uppercase font-semibold text-amber-700 mb-1">
          <ShieldAlert className="w-4 h-4 text-amber-700" />
          <span>Platform Operator & State Inspector</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
          Booking Audit & State Machine Inspector
        </h1>
        <p className="text-xs text-ink-muted mt-1">
          PRD Section 8.6 & 16.5: Constrained admin state machine overrides & append-only immutable audit trail.
        </p>
      </div>

      {/* Admin Quick Action Card */}
      <Card className="p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <span className="text-xs font-mono uppercase font-bold text-primary">
              PRD Section 16.5 Permitted Override Set
            </span>
            <h2 className="text-lg font-bold text-ink">
              Apply Governed Booking Override
            </h2>
          </div>

          <Button
            size="sm"
            variant="danger"
            icon={AlertTriangle}
            onClick={() => setOverrideModalOpen(true)}
            className="self-start sm:self-auto"
          >
            Launch Override Tool
          </Button>
        </div>

        {/* Permitted Rules Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-bg border border-border rounded-xl space-y-1">
            <span className="font-bold text-ink">Force-Expire Request</span>
            <p className="text-[11px] text-ink-muted">
              Open / Pending → Expired. Clear inactive vendor requests.
            </p>
          </div>
          <div className="p-3 bg-bg border border-border rounded-xl space-y-1">
            <span className="font-bold text-ink">Force-Cancel Booking</span>
            <p className="text-[11px] text-ink-muted">
              Any active state → Cancelled. Unblocks stuck disputes.
            </p>
          </div>
          <div className="p-3 bg-bg border border-border rounded-xl space-y-1">
            <span className="font-bold text-ink">Force-Close Booking</span>
            <p className="text-[11px] text-ink-muted">
              Completed → Closed. Resolves unconfirmed completions.
            </p>
          </div>
          <div className="p-3 bg-bg border border-border rounded-xl space-y-1">
            <span className="font-bold text-ink">Forbidden Overrides</span>
            <p className="text-[11px] text-rose-700 font-semibold">
              Reviving a terminal (Closed/Cancelled) state is REJECTED.
            </p>
          </div>
        </div>
      </Card>

      {/* Append-Only Audit Log Table */}
      <Card className="p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink">
              Immutable System Audit Trail ({auditLogs.length})
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              100% append-only coverage capturing actor, action, timestamp, and before/after states.
            </p>
          </div>

          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search audit trail..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-ink focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-border rounded-2xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-bg border-b border-border text-ink-muted uppercase font-mono text-[10px]">
                <th className="p-3.5 pl-4 font-bold">Timestamp</th>
                <th className="p-3.5 font-bold">Actor</th>
                <th className="p-3.5 font-bold">Action</th>
                <th className="p-3.5 font-bold">Target Entity</th>
                <th className="p-3.5 font-bold">State Transition</th>
                <th className="p-3.5 font-bold pr-4">Reason / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAuditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-bg transition-colors">
                  <td className="p-3.5 pl-4 font-mono text-ink-muted whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3.5 whitespace-nowrap">
                    <span className="font-bold text-ink">{log.actorName}</span>
                    <span className="ml-1.5 text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 font-mono">
                      {log.actorRole}
                    </span>
                  </td>
                  <td className="p-3.5 font-bold text-primary whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="p-3.5 font-mono text-ink max-w-[200px] truncate">
                    {log.targetEntity}
                  </td>
                  <td className="p-3.5 font-mono text-[11px] whitespace-nowrap">
                    {log.beforeState && log.afterState ? (
                      <span className="px-2 py-1 rounded-md bg-emerald-50 text-primary">
                        {log.beforeState} → {log.afterState}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="p-3.5 pr-4 text-ink-muted max-w-[220px] truncate">
                    {log.reason || 'System state change'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Admin Override Modal */}
      <Modal
        isOpen={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        title="Apply Governed Admin Override"
        description="PRD Section 16.5: State changes are audited with before/after state and required operator reason."
      >
        <div className="space-y-4 pt-2 text-xs">
          <div>
            <label className="block font-semibold text-ink mb-1">
              Select Booking / Contract ID
            </label>
            <select
              value={selectedBookingId}
              onChange={(e) => setSelectedBookingId(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink"
            >
              {jobs.map((r) => (
                <option key={r.id} value={r.id}>
                  Job {r.id}: {r.title} ({r.status})
                </option>
              ))}
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  Contract {c.id}: {c.jobTitle} ({c.bookingState})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1">
              Target State (Permitted Set)
            </label>
            <select
              value={overrideTargetState}
              onChange={(e) => setOverrideTargetState(e.target.value as BookingState)}
              className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-ink"
            >
              <option value="Expired">Force-Expire Request</option>
              <option value="Cancelled">Force-Cancel Booking</option>
              <option value="Closed">Force-Close Booking</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1">
              Mandatory Operator Audit Reason
            </label>
            <Textarea
              rows={3}
              placeholder="e.g. Unresponsive vendor beyond 72h window, manual phone verification completed."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl p-3 text-xs text-ink"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setOverrideModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!overrideReason.trim()}
              onClick={handleApplyOverride}
            >
              Execute Governed Override
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
