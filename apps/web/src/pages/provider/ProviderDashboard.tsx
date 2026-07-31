import React, { useEffect, useState } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  FileCheck,
  ShieldCheck,
  IndianRupee,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card } from '@marche/ui';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { TimeSlot } from '../../types';
import { formatEventSchedule } from '../../lib/formatTime';
import {
  DEFAULT_DAY_AVAILABILITY,
  getVendorAvailability,
  setVendorAvailability,
  type DayAvailability,
} from '../../lib/availability';

const SLOTS: TimeSlot[] = ['Morning', 'Afternoon', 'Evening', 'Full Day'];

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

export const ProviderDashboard: React.FC = () => {
  const { currentUser, proposals, contracts, jobs, navigate } = useApp();

  const [activeTab, setActiveTab] = useState<'bids' | 'contracts' | 'calendar'>('bids');

  // Vendor's submitted proposals
  const myProposals = proposals.filter((p) => p.vendorId === currentUser.id);

  // Vendor's active or completed contracts
  const myContracts = contracts.filter((c) => c.vendorId === currentUser.id);

  // Total earnings won/held
  const totalEarnings = myContracts.reduce((acc, curr) => acc + curr.amount, 0);

  // Availability calendar state — keyed by ISO date, mock/in-memory only
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = toISODate(today);

  const [calendarMonth, setCalendarMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [availability, setAvailability] = useState<Record<string, DayAvailability>>(() =>
    getVendorAvailability(currentUser.id),
  );
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);

  useEffect(() => {
    setVendorAvailability(currentUser.id, availability);
  }, [availability, currentUser.id]);

  const getDayAvailability = (dateISO: string): DayAvailability =>
    availability[dateISO] ?? DEFAULT_DAY_AVAILABILITY;

  const getAggregateStatus = (dateISO: string): 'open' | 'partial' | 'blocked' | 'booked' => {
    const values = Object.values(getDayAvailability(dateISO));
    if (values.some((v) => v === 'booked')) return 'booked';
    const openCount = values.filter((v) => v === 'open').length;
    if (openCount === values.length) return 'open';
    if (openCount === 0) return 'blocked';
    return 'partial';
  };

  const toggleSlotStatus = (dateISO: string, slot: TimeSlot) => {
    setAvailability((prev) => {
      const current = prev[dateISO] ?? DEFAULT_DAY_AVAILABILITY;
      if (current[slot] === 'booked') return prev; // confirmed contracts can't be manually unblocked
      return {
        ...prev,
        [dateISO]: { ...current, [slot]: current[slot] === 'open' ? 'blocked' : 'open' },
      };
    });
  };

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
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
          My Work
        </h1>
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
          <p className="text-2xl font-bold text-ink">{myProposals.length}</p>
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
          <p className="text-2xl font-bold text-ink">
            ₹{totalEarnings.toLocaleString('en-IN')}
          </p>
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
              My Proposals ({myProposals.length})
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

        {/* TAB 1: My Submitted Bids */}
        {activeTab === 'bids' && (
          <div className="space-y-4">
            {myProposals.length === 0 ? (
              <EmptyState
                title="No active proposals"
                description="Browse open event jobs and submit your first bid."
                actionLabel="Explore Jobs"
                onAction={() => navigate('/provider/dashboard')}
              />
            ) : (
              myProposals.map((proposal) => {
                const req = jobs.find((r) => r.id === proposal.jobId);
                const isDraft = proposal.status === 'draft';
                return (
                  <div
                    key={proposal.id}
                    onClick={() => {
                      if (!req) return;
                      navigate(isDraft ? `/provider/submit-proposal/${req.id}` : `/provider/jobs/${req.id}`);
                    }}
                    className="bg-white border border-border rounded-2xl p-6 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge status={proposal.status} />
                          <span className="text-xs font-mono text-ink-muted">
                            {isDraft ? 'Last saved' : 'Submitted'} {new Date(proposal.submittedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-ink">
                          {req?.title || 'Event Job'}
                        </h3>
                      </div>

                      <div className="text-right">
                        <span className="block text-[10px] font-mono uppercase text-ink-muted">
                          Your Proposed Quote
                        </span>
                        <span className="text-xl font-bold text-primary">
                          ₹{proposal.bidAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-ink-muted line-clamp-2 leading-relaxed mb-4">
                      "{proposal.coverLetter}"
                    </p>

                    <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-ink-muted">
                      <span>Delivery: {proposal.estimatedDelivery}</span>
                      <span className="text-primary font-bold hover:underline flex items-center gap-1">
                        View Details <ChevronRight className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: Contracts */}
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
                        <StatusBadge status={ctr.bookingState} />
                      </div>
                      <h3 className="text-base font-bold text-ink">
                        {ctr.jobTitle}
                      </h3>
                      <p className="text-xs text-ink-muted mt-0.5">
                        Client: {ctr.clientName}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="block text-[10px] font-mono uppercase text-ink-muted">
                        Contract Value
                      </span>
                      <span className="text-xl font-bold text-primary">
                        ₹{ctr.amount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-ink-muted">
                    <span>Event Date: {formatEventSchedule(ctr.eventDate, ctr.timingMode, ctr.eventStartTime, ctr.eventEndTime)}</span>
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
                  const status = getAggregateStatus(dateISO);

                  return (
                    <button
                      key={dateISO}
                      type="button"
                      disabled={isPast}
                      onClick={() => setSelectedDate(dateISO)}
                      className={`aspect-square rounded-lg text-xs font-medium flex flex-col items-center justify-center gap-1 transition-all ${
                        isPast
                          ? 'text-zinc-300 cursor-not-allowed'
                          : 'cursor-pointer hover:bg-bg'
                      } ${isSelected ? 'ring-2 ring-primary' : ''}`}
                    >
                      <span className={isPast ? '' : 'text-ink'}>{date.getDate()}</span>
                      {!isPast && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            status === 'booked'
                              ? 'bg-primary'
                              : status === 'open'
                              ? 'bg-emerald-500'
                              : status === 'partial'
                              ? 'bg-amber-500'
                              : 'bg-rose-400'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-border text-[11px] text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Open
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Partially blocked
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Fully blocked
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Booked (contract confirmed)
                </span>
              </div>
            </Card>

            {/* Selected Day Slot Panel */}
            <Card className="p-6 space-y-3">
              <div>
                <span className="block text-[10px] font-mono uppercase text-ink-muted">
                  Slot Availability
                </span>
                <h3 className="text-sm font-bold text-ink">{selectedDateLabel}</h3>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {SLOTS.map((slot) => {
                  const status = getDayAvailability(selectedDate)[slot];
                  const isBooked = status === 'booked';
                  const isOpen = status === 'open';
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={isBooked}
                      onClick={() => toggleSlotStatus(selectedDate, slot)}
                      className={`p-3 rounded-xl border text-xs font-medium transition-all text-left flex items-center justify-between gap-2 ${
                        isBooked
                          ? 'bg-surface-subtle border-primary/30 text-primary cursor-not-allowed'
                          : isOpen
                          ? 'bg-emerald-50 border-emerald-300 text-primary cursor-pointer'
                          : 'bg-zinc-100 border-zinc-200 text-zinc-500 cursor-pointer'
                      }`}
                    >
                      <span>
                        <span className="block font-bold">{slot} Slot</span>
                        <span className="text-[10px]">
                          {isBooked
                            ? 'BOOKED — CONTRACT CONFIRMED'
                            : isOpen
                            ? 'AVAILABLE FOR BOOKING'
                            : 'BLOCKED / UNAVAILABLE'}
                        </span>
                      </span>
                      {isBooked && <Lock className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
