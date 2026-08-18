import React, { useState } from 'react';
import { ShieldAlert, Search } from 'lucide-react';
import { Card, Input } from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { auditApi } from '../../lib/audit-api';
import { ComingSoonPage } from '../ComingSoonPage';

// The real security audit trail (module1.md's AuditLog — login/logout/
// register/password-reset/email-verified events), not the fabricated
// booking-lifecycle trail this replaced. That mock version also offered a
// "governed override" tool that force-transitioned a booking's state; there
// is no real backend capability for that on Jobs or Connections, so rather
// than keep a control that does nothing real, it's a Coming Soon state like
// every other unbuilt surface in the product.
export const AdminAuditDashboard: React.FC = () => {
  const { accessToken } = useApp();
  const token = accessToken as string;

  const [search, setSearch] = useState('');
  const logs = useApiResource(
    () => auditApi.list(token, 1, 50, search || undefined),
    [token, search],
    { enabled: Boolean(token) },
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="pb-6 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-mono uppercase font-semibold text-amber-700 mb-1">
          <ShieldAlert className="w-4 h-4 text-amber-700" />
          <span>Platform Operator</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
          Security Audit Trail
        </h1>
        <p className="text-xs text-ink-muted mt-1">
          Authentication events — sign-ins, registrations, password resets. Append-only.
        </p>
      </div>

      <ComingSoonPage
        title="Booking overrides"
        description="Forcing a booking or connection into a different state isn't available yet — there's no admin override capability on the backend."
      />

      {/* Audit Log Table */}
      <Card className="p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink">
              Audit Trail{logs.data ? ` (${logs.data.total})` : ''}
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">Newest first.</p>
          </div>

          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search event type or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-ink focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-border rounded-2xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-bg border-b border-border text-ink-muted uppercase font-mono text-[10px]">
                <th className="p-3.5 pl-4 font-bold">Timestamp</th>
                <th className="p-3.5 font-bold">Event</th>
                <th className="p-3.5 font-bold">Email</th>
                <th className="p-3.5 font-bold">IP address</th>
                <th className="p-3.5 font-bold pr-4">User agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(logs.data?.items ?? []).map((log) => (
                <tr key={log.id} className="hover:bg-bg transition-colors">
                  <td className="p-3.5 pl-4 font-mono text-ink-muted whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3.5 font-bold text-primary whitespace-nowrap">
                    {log.eventType}
                  </td>
                  <td className="p-3.5 font-mono text-ink max-w-[220px] truncate">
                    {log.email ?? '—'}
                  </td>
                  <td className="p-3.5 font-mono text-ink-muted whitespace-nowrap">
                    {log.ipAddress ?? '—'}
                  </td>
                  <td className="p-3.5 pr-4 text-ink-muted max-w-[240px] truncate">
                    {log.userAgent ?? '—'}
                  </td>
                </tr>
              ))}
              {logs.data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-ink-muted">
                    No audit events match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
