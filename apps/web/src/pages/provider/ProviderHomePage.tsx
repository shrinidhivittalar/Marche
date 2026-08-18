import React, { useState } from 'react';
import {
  Search,
  X,
  ThumbsDown,
  SlidersHorizontal,
  Megaphone,
  ShieldCheck,
  Calendar,
  MapPin,
  CalendarClock,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  Checkbox,
} from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import {
  isProfileComplete as computeIsProfileComplete,
  isApiProfileComplete,
} from '../../lib/profileCompleteness';
import { useApiResource } from '../../hooks/useApiResource';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { profilesApi, marketplaceApi } from '../../lib/marketplace-api';
import { jobsApi } from '../../lib/jobs-api';
import { formatJobBudget, formatEventWhen, formatDeadline, postedAgo } from '../../lib/formatJob';
import { LOCATIONS } from '../../data/categoryOptions';

const memberSinceFormat = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

// The provider landing feed, on the real Jobs API — the same source
// SearchJobsPage, JobDetailProviderView and MyWorkPage already read. It used
// to render mock requirements, so the ids on its cards could never resolve
// against GET /jobs/:id and "View Full Details" always landed on
// "Requirement not found".
//
// What the mock offered and the API cannot back, therefore removed rather
// than faked:
//
// - "Best matches". Nothing ranks requirements in Phase 1, and sorting an
//   arbitrary page client-side would be a relevance claim with no relevance
//   behind it. The feed is newest-first and says so.
// - The saved tab and the heart. Saving was never persisted; with a
//   paginated feed a "Saved" list could only ever show what happens to be on
//   the current page, which is worse than not offering it.
// - Invites. There is no invitation endpoint, so a permanently empty tab
//   only promises a feature that does not exist.
// - Facet counts on the filters. They were counted off the full mock array;
//   the server would have to aggregate them and Module 4 has no such route.
//
// "Not interested" stays: it is local, applied after the fetch so it cannot
// skew the server's page, exactly as on SearchJobsPage.

const FEED_LIMIT = 12;

export const ProviderHomePage: React.FC = () => {
  const { currentUser, navigate, searchQuery, setSearchQuery, accessToken } = useApp();

  // The real profile, not the demo user — the editor writes to /profiles/me
  // once signed in, so completeness measured against the mock fields could
  // never become true and these notices never went away.
  //
  // Treated as complete while loading, so a provider who finished long ago
  // does not see the banner flash on every visit.
  const myProfile = useApiResource(() => profilesApi.me(accessToken as string), [accessToken], {
    enabled: Boolean(accessToken),
  });
  const isProfileComplete = accessToken
    ? myProfile.loading || isApiProfileComplete(myProfile.data)
    : computeIsProfileComplete(currentUser);

  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categorySlug, setCategorySlug] = useState('');
  const [location, setLocation] = useState('');
  const [pendingCategory, setPendingCategory] = useState('');
  const [pendingLocation, setPendingLocation] = useState('');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Typing must not fire a request per keystroke.
  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  // Real categories: the API matches on a seeded slug, not on the display
  // names the mock filter used.
  const categories = useApiResource(() => marketplaceApi.categories(), []);

  const jobs = useApiResource(
    () =>
      jobsApi.search({
        q: debouncedQuery || undefined,
        category: categorySlug || undefined,
        location: location || undefined,
        sort: 'newest',
        limit: FEED_LIMIT,
      }),
    [debouncedQuery, categorySlug, location],
  );

  const feedItems = (jobs.data?.items ?? []).filter((job) => !dismissedIds.has(job.id));
  const selectedJob = feedItems.find((job) => job.id === selectedJobId);

  const selectedClientProfileId = selectedJob?.clientProfile.id;
  const selectedClientStats = useApiResource(
    () => jobsApi.clientStats(selectedClientProfileId as string),
    [selectedClientProfileId],
    { enabled: Boolean(selectedClientProfileId) },
  );

  const openFiltersModal = () => {
    setPendingCategory(categorySlug);
    setPendingLocation(location);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setCategorySlug(pendingCategory);
    setLocation(pendingLocation);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setPendingCategory('');
    setPendingLocation('');
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header — every other page has a title; this one didn't, which read
          as an unfinished screen on mobile where there's no Sidebar to
          carry the page context instead. */}
      <div className="space-y-0.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Home</div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
          Good Morning, {currentUser.name.split(' ')[0]} 👋
        </h1>
      </div>

      {/* Account Notice Banner — goes away once the profile is actually complete */}
      {!isProfileComplete && !noticeDismissed && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-4 py-3 text-xs">
          <span>
            Your profile is incomplete. Complete it to increase your visibility with clients.
          </span>
          <button
            onClick={() => setNoticeDismissed(true)}
            className="p-1 text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Promo Card — same as above, only shows until the profile is complete */}
      {!isProfileComplete && (
        <div className="relative bg-inverse text-inverse-fg rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden">
          <div className="max-w-lg">
            <div className="flex items-center gap-2 text-xs font-mono uppercase font-semibold text-amber-400 mb-2">
              <Megaphone className="w-4 h-4" />
              <span>Grow Your Business</span>
            </div>
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight mb-2">
              Complete your profile to win more proposals.
            </h2>
            <p className="text-xs text-zinc-300 mb-4">
              Vendors with a complete profile and verified badge appear higher in client searches.
            </p>
            <Button variant="secondary" size="sm" onClick={() => navigate('/provider/profile')}>
              Complete Profile
            </Button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-400 pointer-events-none" />
        <Input
          type="text"
          placeholder="Search jobs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-border rounded-xl pl-10 pr-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary"
        />
      </div>

      {/* Jobs Feed */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Latest jobs</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            The newest open client requirements. Search the full board for more.
          </p>
        </div>

        <div className="flex items-center justify-between border-b border-border pb-3">
          <span className="text-xs text-ink-muted">
            {jobs.loading ? 'Loading…' : `${jobs.data?.total ?? 0} open requirements`}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={openFiltersModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {(categorySlug !== '' || location !== '') && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
            <button
              onClick={() => navigate('/provider/search')}
              className="px-3 py-1.5 rounded-full border border-border text-xs font-medium text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              Browse all
            </button>
          </div>
        </div>

        {jobs.error ? (
          <EmptyState
            title="Requirements could not be loaded"
            description={jobs.error}
            actionLabel="Try again"
            onAction={() => void jobs.refetch()}
          />
        ) : !jobs.loading && feedItems.length === 0 ? (
          <EmptyState
            title="No jobs match your filters"
            description="Try adjusting your keyword search or category filters."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {feedItems.map((job) => (
              <div
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                className="bg-white border border-border rounded-2xl p-5 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-surface-subtle text-[11px] font-bold text-primary border border-border">
                    {job.category.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDismissedIds((prev) => new Set(prev).add(job.id));
                    }}
                    title="Not interested"
                    className="text-zinc-400 hover:text-ink cursor-pointer shrink-0"
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="text-sm font-bold text-ink line-clamp-2 leading-snug">
                  {job.title}
                </h3>

                <p className="text-xs text-ink-muted line-clamp-3 leading-relaxed flex-1">
                  {job.description}
                </p>

                <div className="space-y-1.5 text-xs text-ink-muted pt-2 border-t border-border">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-primary">{formatJobBudget(job)}</span>
                    <span className="shrink-0">{postedAgo(job.publishedAt ?? job.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>
                      {job.proposalCount} proposal{job.proposalCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {job.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                      <span className="truncate">{job.location}</span>
                    </div>
                  )}
                  {job.clientProfile.verifiedAt && (
                    <span className="flex items-center gap-1 text-primary font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Verified client
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Job Overview Dialog */}
      <Dialog open={!!selectedJobId} onOpenChange={(open) => !open && setSelectedJobId(null)}>
        <DialogContent className="max-w-lg">
          {selectedJob && (
            <>
              <DialogHeader>
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-surface-subtle text-[11px] font-bold text-primary border border-border mb-2">
                    {selectedJob.category.name}
                  </span>
                  <DialogTitle>{selectedJob.title}</DialogTitle>
                  <DialogDescription>
                    {postedAgo(selectedJob.publishedAt ?? selectedJob.createdAt)} •{' '}
                    {selectedJob.clientProfile.displayName} • {selectedJob.proposalCount} proposal
                    {selectedJob.proposalCount === 1 ? '' : 's'}
                  </DialogDescription>
                </div>
              </DialogHeader>

              <DialogBody className="space-y-4">
                <p className="text-xs text-ink leading-relaxed">{selectedJob.description}</p>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-bg border border-border rounded-xl">
                    <span className="block text-[10px] text-ink-muted uppercase font-mono">
                      Budget
                    </span>
                    <span className="font-bold text-primary">{formatJobBudget(selectedJob)}</span>
                  </div>
                  {/* Each of these is optional on the API, so it is only shown
                      when the client actually stated it. */}
                  {formatEventWhen(selectedJob) && (
                    <div className="p-3 bg-bg border border-border rounded-xl">
                      <span className="flex items-center gap-1 text-[10px] text-ink-muted uppercase font-mono">
                        <Calendar className="w-3 h-3" /> Event Schedule
                      </span>
                      <span className="font-semibold text-ink">{formatEventWhen(selectedJob)}</span>
                    </div>
                  )}
                  {selectedJob.location && (
                    <div className="p-3 bg-bg border border-border rounded-xl flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="font-semibold text-ink">{selectedJob.location}</span>
                    </div>
                  )}
                  {formatDeadline(selectedJob) && (
                    <div className="p-3 bg-bg border border-border rounded-xl flex items-center gap-2">
                      <CalendarClock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="font-semibold text-amber-700">
                        Due {formatDeadline(selectedJob)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Deliverables and full client identity — the two things the
                    card doesn't have room for, so this overview earns its
                    place between the card and the full detail page instead
                    of just repeating the card at a larger size. */}
                {selectedJob.deliverables.length > 0 && (
                  <div>
                    <span className="block text-[10px] text-ink-muted uppercase font-mono mb-1.5">
                      Expected Deliverables
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedJob.deliverables.map((deliverable) => (
                        <span
                          key={deliverable}
                          className="px-2.5 py-1 rounded-full bg-bg border border-border text-[11px] text-ink"
                        >
                          {deliverable}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-3 bg-bg border border-border rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-surface-subtle ring-1 ring-border flex items-center justify-center text-[11px] font-bold text-ink shrink-0">
                      {selectedJob.clientProfile.displayName.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block font-bold text-ink truncate">
                        {selectedJob.clientProfile.displayName}
                      </span>
                      <span className="block text-[10px] text-ink-muted truncate">
                        {selectedJob.clientProfile.location ?? 'Location not stated'}
                      </span>
                    </div>
                    {selectedJob.clientProfile.verifiedAt && (
                      <span className="flex items-center gap-1 text-primary font-semibold text-[11px] shrink-0">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Verified
                      </span>
                    )}
                  </div>

                  {/* Real hiring history — no spend or hourly-rate figures,
                      since this app has no payment integration. */}
                  {selectedClientStats.data && (
                    <div className="pt-2 border-t border-border flex items-center justify-between gap-2 text-[11px] text-ink-muted">
                      <span>
                        {selectedClientStats.data.jobsPosted} job
                        {selectedClientStats.data.jobsPosted === 1 ? '' : 's'} posted
                      </span>
                      <span>
                        {selectedClientStats.data.hireRate !== null
                          ? `${Math.round(selectedClientStats.data.hireRate * 100)}% hire rate`
                          : 'Not yet hired'}
                      </span>
                      <span>
                        Since{' '}
                        {memberSinceFormat.format(new Date(selectedClientStats.data.memberSince))}
                      </span>
                    </div>
                  )}
                </div>
              </DialogBody>

              <DialogFooter>
                <button
                  onClick={() => setSelectedJobId(null)}
                  className="text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer mr-auto"
                >
                  Close
                </button>
                <Button
                  size="sm"
                  icon={ArrowRight}
                  iconPosition="right"
                  onClick={() => navigate(`/provider/jobs/${selectedJob.id}`)}
                >
                  View Full Details
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Filters Modal */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div>
              <DialogTitle>Filters</DialogTitle>
              <DialogDescription>
                The feed shows the newest requirements matching your filters.
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-6">
            {/* Single-select, because the API filters on one category slug and
                one location. Kept as checkboxes to preserve the look, but they
                behave as radios — picking one clears the rest. */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-ink uppercase tracking-wide">Category</h3>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                  <Checkbox
                    checked={pendingCategory === ''}
                    onCheckedChange={() => setPendingCategory('')}
                  />
                  <span className="flex-1">All categories</span>
                </label>
                {(categories.data ?? []).map((category) => (
                  <label
                    key={category.id}
                    className="flex items-center gap-2.5 text-xs text-ink cursor-pointer"
                  >
                    <Checkbox
                      checked={pendingCategory === category.slug}
                      onCheckedChange={(checked) =>
                        setPendingCategory(checked ? category.slug : '')
                      }
                    />
                    <span className="flex-1">{category.name}</span>
                  </label>
                ))}
                {categories.error && (
                  <p className="text-[11px] text-danger">Categories could not be loaded.</p>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-border">
              <h3 className="text-xs font-bold text-ink uppercase tracking-wide">Location</h3>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                  <Checkbox
                    checked={pendingLocation === ''}
                    onCheckedChange={() => setPendingLocation('')}
                  />
                  <span className="flex-1">Anywhere</span>
                </label>
                {LOCATIONS.map((loc) => (
                  <label
                    key={loc.value}
                    className="flex items-center gap-2.5 text-xs text-ink cursor-pointer"
                  >
                    <Checkbox
                      checked={pendingLocation === loc.value}
                      onCheckedChange={(checked) => setPendingLocation(checked ? loc.value : '')}
                    />
                    <span className="flex-1">{loc.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <button
              onClick={clearFilters}
              className="text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer mr-auto"
            >
              Clear
            </button>
            <Button size="sm" onClick={applyFilters}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
