import React, { useState } from 'react';
import {
  Plus,
  Search,
  CheckCircle2,
  User,
  Sliders,
  ChevronRight,
  FileSignature,
  ArrowUpDown,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MyRequirements } from '../../components/jobs/MyRequirements';
import { Button, Card, Input } from '@marche/ui';
import {
  isProfileComplete as computeIsProfileComplete,
  isApiProfileComplete,
} from '../../lib/profileCompleteness';
import { useApiResource } from '../../hooks/useApiResource';
import { profilesApi } from '../../lib/marketplace-api';
import { jobsApi, type JobStatus } from '../../lib/jobs-api';
import { connectionsApi } from '../../lib/proposals-api';
import { formatJobBudget } from '../../lib/formatJob';

// Wording for the statuses the API actually has. The mock model had Paused,
// Closed and Completed as well; none of them exists on a real requirement.
const REQUIREMENT_STATUS: Record<JobStatus, { label: string; className: string }> = {
  DRAFT: {
    label: 'Draft',
    className: 'bg-surface-subtle text-ink-muted border-border',
  },
  PUBLISHED: {
    label: 'Published',
    className:
      'bg-emerald-50 dark:bg-emerald-500/10 text-primary border-emerald-200 dark:border-emerald-500/20',
  },
  FILLED: {
    label: 'Filled',
    className: 'bg-primary-subtle text-primary border-primary/20',
  },
  CANCELLED: {
    label: 'Cancelled',
    className:
      'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20',
  },
};

interface ClientDashboardProps {
  view?: 'dashboard' | 'jobs' | 'settings';
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({ view = 'dashboard' }) => {
  const { currentUser, navigate, clientSettings, updateClientSettings, accessToken } = useApp();

  // Read from the real profile, not the demo user. The editor writes to
  // /profiles/me once signed in, so a checklist built on the mock fields
  // could never be satisfied — which is exactly how it ended up permanent.
  const myProfile = useApiResource(() => profilesApi.me(accessToken as string), [accessToken], {
    enabled: Boolean(accessToken),
  });
  const isProfileComplete = accessToken
    ? isApiProfileComplete(myProfile.data)
    : computeIsProfileComplete(currentUser);

  // Only the profile counts. Payments do not exist in Phase 1, and email
  // verification already happened at sign-up and is not actionable from
  // here — listing either as an outstanding task asks for something that
  // cannot be done.
  //
  // Still loading is treated as complete, so the card does not flash on
  // every dashboard load for someone who finished setting up long ago.
  const isSetupComplete = myProfile.loading || isProfileComplete;

  // Top-level tab for Jobs View (matches "All job posts" / "All contracts")
  const [jobsTab, setJobsTab] = useState<'posts' | 'contracts'>('posts');
  const [contractSearch, setContractSearch] = useState('');
  const [contractSortDir, setContractSortDir] = useState<'asc' | 'desc'>('desc');

  // The Jobs view's own filter tabs, search and category state went with the
  // mock list it filtered — MyRequirements owns those now, against real data.

  // The edit and delete modals, the row menu and the carousel went with the
  // mock overview they served. Editing and cancelling a requirement live on
  // its own page, against the real API.

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // The client's real requirements, for the overview and the KPI row. The
  // mock list this replaced was filtered by a mock client id, so it matched
  // nothing once the requirements themselves became real.
  const myRequirements = useApiResource(
    () => jobsApi.mine(accessToken as string, 1, 50),
    [accessToken],
    { enabled: Boolean(accessToken) },
  );

  // "Active" means live to providers. A draft is not, and a filled or
  // cancelled one has left discovery.
  const activeJobsCount = (myRequirements.data?.items ?? []).filter(
    (r) => r.status === 'PUBLISHED',
  ).length;

  // The client's real connections (for the "All contracts" tab and the KPI
  // row) — the mock `contracts` array this replaced only ever held demo
  // fixture data, since `hireVendor` (the action that would have populated
  // it) is unreachable from any real navigation.
  const myConnections = useApiResource(
    () => connectionsApi.mine(accessToken as string, 1, 50),
    [accessToken],
    { enabled: Boolean(accessToken) },
  );
  const connectionItems = myConnections.data?.items ?? [];

  const inProgressContracts = connectionItems.filter((c) => c.status === 'ACTIVE');
  const completedContracts = connectionItems.filter((c) => c.status === 'COMPLETED');

  const filteredContracts = connectionItems
    .filter((c) => {
      if (!contractSearch.trim()) return true;
      const q = contractSearch.toLowerCase();
      return (
        c.job.title.toLowerCase().includes(q) ||
        c.providerProfile.displayName.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      // Nulls (no event date set) sort last regardless of direction — there
      // is nothing to compare them against.
      if (!a.job.eventDate) return 1;
      if (!b.job.eventDate) return -1;
      const diff = new Date(a.job.eventDate).getTime() - new Date(b.job.eventDate).getTime();
      return contractSortDir === 'asc' ? diff : -diff;
    });

  // Shared by every view below — previously copy-pasted once per view and had drifted
  // (different button styles) between the copies.

  // ---------------------------------------------------------------------
  // VIEW: MY JOBS ONLY
  // ---------------------------------------------------------------------
  if (view === 'jobs') {
    return (
      <div className="space-y-6 w-full">
        {toastMessage && (
          <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Top-Level Tabs: All job posts / All contracts */}
        <div className="flex items-center gap-6 border-b border-border">
          <button
            onClick={() => setJobsTab('posts')}
            className={`pb-3 text-sm font-semibold transition-colors cursor-pointer border-b-2 -mb-px ${
              jobsTab === 'posts'
                ? 'text-ink border-primary'
                : 'text-ink-muted border-transparent hover:text-ink'
            }`}
          >
            All job posts
          </button>
          <button
            onClick={() => setJobsTab('contracts')}
            className={`pb-3 text-sm font-semibold transition-colors cursor-pointer border-b-2 -mb-px ${
              jobsTab === 'contracts'
                ? 'text-ink border-primary'
                : 'text-ink-muted border-transparent hover:text-ink'
            }`}
          >
            All contracts
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">
            {jobsTab === 'contracts' ? 'Contracts' : 'Hiring'}
          </h1>

          <Button size="md" icon={Plus} onClick={() => navigate('/client/jobs/new')}>
            Post a new job
          </Button>
        </div>

        {jobsTab === 'contracts' ? (
          <>
            {/* Search, Filters, Sort */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-ink-muted pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search by contract, freelancer, or agency name"
                  value={contractSearch}
                  onChange={(e) => setContractSearch(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-ink placeholder-zinc-400 focus:outline-none focus:border-primary transition-all"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  showToast(
                    "Advanced filters aren't wired up yet — Marché is still a frontend preview.",
                  )
                }
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer shrink-0"
              >
                <Sliders className="w-3.5 h-3.5" />
                Filters
              </button>

              <div className="flex items-center gap-2 text-xs shrink-0">
                <span className="text-ink-muted font-medium">Sort by Start date</span>
                <button
                  type="button"
                  onClick={() => setContractSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-bg border border-border hover:border-border-strong font-semibold text-ink transition-all cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-ink-muted" />
                  {contractSortDir === 'asc' ? 'Ascending' : 'Descending'}
                </button>
              </div>

              <span className="text-xs text-ink-muted font-medium shrink-0">
                {filteredContracts.length} total
              </span>
            </div>

            {filteredContracts.length === 0 ? (
              <div className="bg-surface border border-border rounded-3xl p-16 text-center space-y-4 shadow-xs">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-primary flex items-center justify-center mx-auto">
                  <FileSignature className="w-8 h-8" />
                </div>
                <div className="max-w-md mx-auto space-y-1.5">
                  <h3 className="text-base font-bold text-ink">
                    You don't have any contracts yet.
                  </h3>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    Your pending and active contracts will be available here when you start hiring
                    talent.{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/client/jobs/new')}
                      className="text-primary font-semibold hover:underline cursor-pointer"
                    >
                      Post a job
                    </button>{' '}
                    or{' '}
                    <button
                      type="button"
                      onClick={() => setJobsTab('posts')}
                      className="text-primary font-semibold hover:underline cursor-pointer"
                    >
                      check out who's applied
                    </button>{' '}
                    to your existing job posts.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredContracts.map((ctr) => (
                  <Card key={ctr.id} className="p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <span className="text-xs font-mono font-bold text-primary truncate">
                        REF: {ctr.id.slice(0, 8)}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-primary text-[10px] font-extrabold">
                        {ctr.status}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-ink">{ctr.job.title}</h3>
                      <p className="text-xs text-ink-muted">
                        Provider: <strong>{ctr.providerProfile.displayName}</strong>
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-bg border border-border flex items-center justify-between text-xs">
                      <div>
                        <span className="block text-[10px] text-ink-muted">Booking Amount</span>
                        <span className="text-sm font-extrabold text-ink">
                          ₹{Number(ctr.proposal.proposedPrice).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <Button size="sm" onClick={() => navigate(`/contracts/${ctr.id}`)}>
                        Manage Contract
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : (
          // The client requirement list, on the real Jobs API. The mock block
          // that stood here is replaced rather than kept alongside it: two
          // lists of the same thing, one of them invented, is how a client
          // ends up trusting the wrong one.
          <MyRequirements />
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // VIEW: SETTINGS
  // ---------------------------------------------------------------------
  if (view === 'settings') {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        {toastMessage && (
          <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">
            Client Account Settings
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Configure notifications and security preferences.
          </p>
        </div>

        <Card className="p-6 space-y-6">
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-ink">Notification Preferences</h2>
            <div className="space-y-3 text-xs text-ink">
              <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-border bg-bg px-3 py-3 transition-colors hover:border-primary/40">
                <input
                  type="checkbox"
                  checked={clientSettings.instantProposalAlerts}
                  onChange={(event) => {
                    updateClientSettings({ instantProposalAlerts: event.target.checked });
                    showToast('Settings saved.');
                  }}
                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
                <span>Receive instant alert when a vendor submits a proposal</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-border bg-bg px-3 py-3 transition-colors hover:border-primary/40">
                <input
                  type="checkbox"
                  checked={clientSettings.milestoneReminders}
                  onChange={(event) => {
                    updateClientSettings({ milestoneReminders: event.target.checked });
                    showToast('Settings saved.');
                  }}
                  className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                />
                <span>Send milestone reminders 24h before event date</span>
              </label>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // DEFAULT VIEW: CLIENT DASHBOARD
  // ---------------------------------------------------------------------
  // Counted from the client's real requirements. The proposal count comes
  // back on each one — counted per request rather than stored, so it cannot
  // drift out of date the way a cached column would.
  const requirements = myRequirements.data?.items ?? [];
  const requirementTotal = myRequirements.data?.total ?? requirements.length;
  const totalProposalsReceived = requirements.reduce((sum, r) => sum + (r.proposalCount ?? 0), 0);
  // Still open and waiting on the client: published, with at least one
  // proposal nobody has decided on yet.
  const pendingProposalsCount = requirements.filter(
    (r) => r.status === 'PUBLISHED' && (r.proposalCount ?? 0) > 0,
  ).length;

  // Generate insight line
  const getInsightText = () => {
    if (pendingProposalsCount > 0) {
      return `You have ${pendingProposalsCount} proposal${pendingProposalsCount > 1 ? 's' : ''} waiting for review.`;
    }
    if (inProgressContracts.length > 0) {
      return `You have ${inProgressContracts.length} active project${inProgressContracts.length > 1 ? 's' : ''} in progress.`;
    }
    if (activeJobsCount > 0) {
      return `You have ${activeJobsCount} job${activeJobsCount > 1 ? 's' : ''} active on the marketplace.`;
    }
    return 'Get started by creating your first service job.';
  };

  return (
    <div className="space-y-5 w-full transition-all">
      {toastMessage && (
        <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Dashboard Overview
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
            Good Morning, {currentUser.name.split(' ')[0]} 👋
          </h1>
          <p className="text-xs font-medium text-ink-muted">{getInsightText()}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('/client/jobs/new')}
            className="flex items-center gap-2 px-3.5 py-2 bg-primary text-primary-foreground hover:bg-primary-hover rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Job</span>
          </button>
        </div>
      </div>

      {/* Setup checklist — one item, because one is real.
          The payment card and the email-verified card were removed: payments
          are not built, and email verification happens at sign-up and cannot
          be acted on from here. Both were listed as outstanding work that no
          amount of clicking could clear. */}
      {!isSetupComplete && (
        <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 shadow-2xs">
          <h2 className="text-sm font-extrabold text-ink tracking-tight mb-3">
            Finish setting up your account
          </h2>
          <button
            type="button"
            onClick={() => navigate('/client/profile')}
            className="w-full text-left p-3.5 rounded-xl border border-border bg-bg/60 hover:border-border-strong hover:bg-surface transition-all cursor-pointer space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Helps providers price your work
              </span>
              <User className="w-4 h-4 text-ink-muted" />
            </div>
            <p className="text-xs font-bold text-primary underline underline-offset-2">
              Complete your profile
            </p>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Add a headline, a short bio and your location so providers know who they are proposing
              to.
            </p>
          </button>
        </div>
      )}

      {/* Compact KPI Cards Grid (4 cards in a single row on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Active Jobs */}
        <div
          onClick={() => navigate('/client/jobs')}
          className="bg-surface p-3.5 sm:p-4 rounded-xl border border-border hover:border-border-strong hover:shadow-2xs transition-all cursor-pointer space-y-1.5 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-muted">Active Jobs</span>
            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-200/50 dark:border-emerald-500/20">
              Active
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-extrabold text-ink group-hover:text-primary transition-colors">
              {activeJobsCount}
            </p>
            <span className="text-[11px] text-ink-muted">
              {activeJobsCount === 1 ? '1 brief' : `${activeJobsCount} briefs`}
            </span>
          </div>
        </div>

        {/* New Proposals */}
        <div
          onClick={() => navigate('/client/jobs')}
          className="bg-surface p-3.5 sm:p-4 rounded-xl border border-border hover:border-border-strong hover:shadow-2xs transition-all cursor-pointer space-y-1.5 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-muted">New Proposals</span>
            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-200/50 dark:border-amber-500/20">
              {pendingProposalsCount > 0 ? `${pendingProposalsCount} pending` : 'Reviewed'}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-extrabold text-ink group-hover:text-primary transition-colors">
              {totalProposalsReceived}
            </p>
            <span className="text-[11px] text-ink-muted">Received</span>
          </div>
        </div>

        {/* Active Projects */}
        <div
          onClick={() => navigate('/client/jobs')}
          className="bg-surface p-3.5 sm:p-4 rounded-xl border border-border hover:border-border-strong hover:shadow-2xs transition-all cursor-pointer space-y-1.5 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-muted">Active Projects</span>
            <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-200/50 dark:border-blue-500/20">
              In progress
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-extrabold text-ink group-hover:text-primary transition-colors">
              {inProgressContracts.length}
            </p>
            <span className="text-[11px] text-ink-muted">Active</span>
          </div>
        </div>

        {/* Completed Projects */}
        <div
          onClick={() => navigate('/client/jobs')}
          className="bg-surface p-3.5 sm:p-4 rounded-xl border border-border hover:border-border-strong hover:shadow-2xs transition-all cursor-pointer space-y-1.5 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-muted">Completed Projects</span>
            <span className="text-[10px] font-semibold text-ink bg-surface-subtle px-1.5 py-0.5 rounded border border-border">
              Delivered
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-extrabold text-ink group-hover:text-primary transition-colors">
              {completedContracts.length}
            </p>
            <span className="text-[11px] text-ink-muted">Delivered</span>
          </div>
        </div>
      </div>

      {/* Overview — the client's real requirements.
          This block used to read mock jobs filtered by a mock client id, so
          it was permanently empty for anyone signed in. The row menu went
          with it: Edit, Pause, Duplicate and Delete all operated on mock
          state, and only two of the four have a real equivalent (cancel, and
          delete-a-draft) — both already on the requirement's own page. */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-base font-extrabold text-ink tracking-tight">Overview</h2>
          <button
            onClick={() => navigate('/client/jobs')}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>View all ({requirementTotal})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {myRequirements.loading && (
          <p className="text-xs text-ink-muted">Loading your requirements…</p>
        )}

        {myRequirements.error && <p className="text-xs text-destructive">{myRequirements.error}</p>}

        {!myRequirements.loading && !myRequirements.error && requirements.length === 0 && (
          <div className="py-8 text-center space-y-3">
            <p className="text-xs text-ink-muted">
              You have not posted a requirement yet. Post one and providers can start proposing.
            </p>
            <Button size="sm" icon={Plus} onClick={() => navigate('/client/jobs/new')}>
              Post a job
            </Button>
          </div>
        )}

        {requirements.length > 0 && (
          <div className="space-y-2.5">
            {requirements.slice(0, 5).map((req) => {
              const status = REQUIREMENT_STATUS[req.status];
              return (
                <button
                  key={req.id}
                  type="button"
                  data-testid="overview-requirement"
                  onClick={() => navigate(`/client/jobs/${req.id}`)}
                  className="w-full text-left p-3.5 rounded-xl border border-border bg-surface hover:border-border-strong transition-all flex items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-ink truncate max-w-[220px] sm:max-w-none">
                        {req.title}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-ink-muted flex-wrap">
                      <span className="font-semibold text-ink">{req.category.name}</span>
                      <span>•</span>
                      <span>
                        Budget: <strong className="text-ink">{formatJobBudget(req)}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        <strong className="text-ink">{req.proposalCount ?? 0}</strong> proposal
                        {(req.proposalCount ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
