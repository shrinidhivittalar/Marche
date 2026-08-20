import React, { useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  MapPin,
  FileCheck,
  ShieldCheck,
  IndianRupee,
  CheckCircle2,
  Clock3,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card } from '@marche/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { ProposalStatusBadge } from '../../components/proposals/ProposalStatusBadge';
import { useApiResource } from '../../hooks/useApiResource';
import { proposalsApi, connectionsApi } from '../../lib/proposals-api';
import { formatOffer, formatSubmitted, formatTurnaround } from '../../lib/formatProposal';
import { formatEventWhen } from '../../lib/formatJob';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthCells(monthDate: Date): (Date | null)[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

export const MyWorkPage: React.FC = () => {
  const { currentUser, navigate, accessToken } = useApp();

  const [activeTab, setActiveTab] = useState<'bids' | 'contracts' | 'calendar'>('bids');

  // The proposals tab is on the real API as of Module 5. The calendar tab
  // below is still mock — availability has no backend yet.
  //
  // There is no longer a draft/submitted split: a proposal is submitted
  // complete, in one operation, so every row here is a real submission.
  const myProposals = useApiResource(
    () => proposalsApi.mine(accessToken as string),
    [accessToken],
    { enabled: Boolean(accessToken) },
  );
  const proposalItems = myProposals.data?.items ?? [];

  // Vendor's connections — the mock `contracts` array this replaced only
  // ever held demo fixture data (see ClientDashboard.tsx for why).
  const myConnections = useApiResource(
    () => connectionsApi.mine(accessToken as string, 1, 50),
    [accessToken],
    { enabled: Boolean(accessToken) },
  );
  const myContracts = myConnections.data?.items ?? [];

  // Total earnings won/held
  const totalEarnings = myContracts.reduce(
    (acc, curr) => acc + Number(curr.proposal.proposedPrice),
    0,
  );

  // Availability calendar — real data as of the availability-calendar module:
  // pending dates from submitted proposals, confirmed dates from active
  // connections. See ConnectionsService.myCalendar for how the two combine.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = toISODate(today);

  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);

  const myCalendar = useApiResource(
    () => connectionsApi.myCalendar(accessToken as string),
    [accessToken],
    { enabled: Boolean(accessToken) },
  );
  const calendarByDate = new Map((myCalendar.data ?? []).map((entry) => [entry.date, entry]));

  const goToPrevMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">My Work</h1>
        <p className="text-xs text-ink-muted mt-1">
          Track your bids, manage active event deliveries, and manage your availability calendar.
        </p>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-medium">Submitted Proposals</span>
            <FileCheck className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-ink">{myProposals.data?.total ?? 0}</p>
          <p className="text-[11px] text-ink-muted mt-1">Active client bids</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-medium">Won Contracts</span>
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-ink">{myContracts.length}</p>
          <p className="text-[11px] text-ink-muted mt-1">Confirmed or completed</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-medium">Total Revenue Won</span>
            <IndianRupee className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-ink">₹{totalEarnings.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-ink-muted mt-1">0% vendor commission</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between text-ink-muted mb-2">
            <span className="text-xs font-medium">Client Rating</span>
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-ink">{currentUser.rating || 4.98}</p>
          <p className="text-[11px] text-ink-muted mt-1">100% on-time delivery</p>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('bids')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'bids'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-white text-ink-muted hover:text-ink border border-border'
              }`}
            >
              My Proposals ({myProposals.data?.total ?? 0})
            </button>

            <button
              onClick={() => setActiveTab('contracts')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'contracts'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-white text-ink-muted hover:text-ink border border-border'
              }`}
            >
              Active Contracts ({myContracts.length})
            </button>

            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'calendar'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-white text-ink-muted hover:text-ink border border-border'
              }`}
            >
              Availability Calendar
            </button>
          </div>
        </div>

        {/* TAB 1: My Submitted Proposals — real API */}
        {activeTab === 'bids' && (
          <div className="space-y-4">
            {myProposals.loading && <p className="text-xs text-ink-muted">Loading proposals…</p>}

            {myProposals.error && <p className="text-xs text-destructive">{myProposals.error}</p>}

            {!myProposals.loading && !myProposals.error && proposalItems.length === 0 && (
              <EmptyState
                title="No proposals yet"
                description="Browse open requirements and send your first proposal."
                actionLabel="Browse requirements"
                onAction={() => navigate('/provider/search')}
              />
            )}

            {proposalItems.map((proposal) => (
              <div
                key={proposal.id}
                data-testid="my-proposal-row"
                data-status={proposal.status}
                // The proposal, not the requirement it targets: this is where
                // its status, attachments and withdrawal live.
                onClick={() => navigate(`/provider/proposals/${proposal.id}`)}
                className="bg-white border border-border rounded-2xl p-6 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <ProposalStatusBadge status={proposal.status} />
                      <span className="text-xs font-mono text-ink-muted">
                        {formatSubmitted(proposal)}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-ink truncate">{proposal.job.title}</h3>
                    <p className="text-xs text-ink-muted mt-0.5">
                      For {proposal.job.clientProfile.displayName}
                    </p>
                    {/* When and where. A provider scanning this list is
                        deciding whether they are free and can get there —
                        the title and the price do not answer either. */}
                    <div className="flex items-center gap-3 flex-wrap text-[11px] text-ink-muted mt-1.5">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                        {formatEventWhen(proposal.job) ?? 'No date set'}
                      </span>
                      {proposal.job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          {proposal.job.location}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="block text-[10px] font-mono uppercase text-ink-muted">
                      Your quote
                    </span>
                    <span className="text-xl font-bold text-primary">{formatOffer(proposal)}</span>
                  </div>
                </div>

                <p className="text-xs text-ink-muted line-clamp-2 leading-relaxed mb-4">
                  {proposal.job.isDirect
                    ? 'Direct offer — outside the marketplace.'
                    : proposal.coverMessage}
                </p>

                <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-ink-muted">
                  <span>Turnaround: {formatTurnaround(proposal)}</span>
                  <span className="text-primary font-bold hover:underline flex items-center gap-1">
                    View proposal <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: Contracts — real connection data. */}
        {activeTab === 'contracts' && (
          <div className="space-y-4">
            {myContracts.length === 0 ? (
              <EmptyState
                title="No active contracts yet"
                description="When a client accepts your proposal, your contract will appear here."
                actionLabel="Explore Jobs"
                onAction={() => navigate('/provider/dashboard')}
              />
            ) : (
              myContracts.map((ctr) => (
                <div
                  key={ctr.id}
                  onClick={() => navigate(`/contracts/${ctr.id}`)}
                  className="bg-white border border-border rounded-2xl p-6 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={ctr.status} />
                      </div>
                      <h3 className="text-base font-bold text-ink">{ctr.job.title}</h3>
                      <p className="text-xs text-ink-muted mt-0.5">
                        Client: {ctr.clientProfile.displayName}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="block text-[10px] font-mono uppercase text-ink-muted">
                        Contract Value
                      </span>
                      <span className="text-xl font-bold text-primary">
                        ₹{Number(ctr.proposal.proposedPrice).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-ink-muted">
                    <span>
                      Event Date:{' '}
                      {ctr.job.eventDate
                        ? new Date(ctr.job.eventDate).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Not set'}
                    </span>
                    <span className="text-primary font-bold hover:underline flex items-center gap-1">
                      Open Contract Room <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: Availability Calendar */}
        {activeTab === 'calendar' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Month Grid */}
            <Card className="p-6 space-y-4 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-ink">
                  {calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={goToPrevMonth}
                    className="p-1.5 rounded-lg border border-border text-ink-muted hover:text-ink hover:bg-bg cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={goToNextMonth}
                    className="p-1.5 rounded-lg border border-border text-ink-muted hover:text-ink hover:bg-bg cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label} className="text-[10px] font-semibold text-ink-muted py-1">
                    {label}
                  </span>
                ))}

                {getMonthCells(calendarMonth).map((date, idx) => {
                  if (!date) return <span key={`empty-${idx}`} />;

                  const dateISO = toISODate(date);
                  const isPast = dateISO < todayISO;
                  const isSelected = dateISO === selectedDate;
                  const entry = calendarByDate.get(dateISO);

                  return (
                    <button
                      key={dateISO}
                      type="button"
                      onClick={() => setSelectedDate(dateISO)}
                      className={`aspect-square rounded-lg text-xs font-medium flex flex-col items-center justify-center gap-1 transition-all cursor-pointer hover:bg-bg ${
                        isPast ? 'text-zinc-300' : ''
                      } ${isSelected ? 'ring-2 ring-primary' : ''}`}
                    >
                      <span className={isPast ? '' : 'text-ink'}>{date.getDate()}</span>
                      {entry && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            entry.status === 'CONFIRMED' ? 'bg-primary' : 'bg-amber-500'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-border text-[11px] text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending proposal
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Confirmed booking
                </span>
              </div>
            </Card>

            {/* Selected Day Panel */}
            <Card className="p-6 space-y-3">
              <div>
                <span className="block text-[10px] font-mono uppercase text-ink-muted">
                  Selected Day
                </span>
                <h3 className="text-sm font-bold text-ink">{selectedDateLabel}</h3>
              </div>

              {myCalendar.loading && <p className="text-xs text-ink-muted">Loading calendar…</p>}

              {(() => {
                const entry = calendarByDate.get(selectedDate);
                if (!entry) {
                  return (
                    <p className="text-xs text-ink-muted">No proposals or bookings on this day.</p>
                  );
                }
                const isConfirmed = entry.status === 'CONFIRMED';
                return (
                  <div
                    className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                      isConfirmed
                        ? 'bg-surface-subtle border-primary/30 text-primary'
                        : 'bg-amber-50 border-amber-300 text-amber-700'
                    }`}
                  >
                    {isConfirmed ? (
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Clock3 className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      <span className="block font-bold">{entry.jobTitle}</span>
                      <span className="text-[10px]">
                        {isConfirmed ? 'BOOKED — CLIENT HIRED YOU' : 'PENDING — AWAITING CLIENT'}
                      </span>
                    </span>
                  </div>
                );
              })()}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
