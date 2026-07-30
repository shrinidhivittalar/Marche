import React, { useState } from 'react';
import {
  Search,
  ChevronRight,
  ChevronLeft,
  X,
  Heart,
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
import { formatEventSchedule } from '../../lib/formatTime';
import { CATEGORIES, LOCATIONS } from '../../data/categoryOptions';

type FeedTab = 'best' | 'recent' | 'saved' | 'invites';

export const ProviderHomePage: React.FC = () => {
  const {
    currentUser,
    jobs,
    navigate,
    searchQuery,
    setSearchQuery,
    selectedCategoryFilter,
    setSelectedCategoryFilter,
  } = useApp();

  // ---- Upwork-inspired home feed state ----
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [feedTab, setFeedTab] = useState<FeedTab>('best');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locationFilter, setLocationFilter] = useState('All');
  const [pendingCategory, setPendingCategory] = useState(selectedCategoryFilter);
  const [pendingLocation, setPendingLocation] = useState(locationFilter);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const selectedJob = selectedJobId
    ? jobs.find((r) => r.id === selectedJobId)
    : undefined;

  const toggleSaved = (id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const dismissJob = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  const openJobs = jobs.filter((r) => !dismissedIds.has(r.id));

  const filteredFeed = openJobs.filter((req) => {
    const matchesCategory =
      selectedCategoryFilter === 'All' || req.category === selectedCategoryFilter;
    const matchesSearch =
      req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLocation =
      locationFilter === 'All' || req.location.toLowerCase().includes(locationFilter.toLowerCase());
    return matchesCategory && matchesSearch && matchesLocation;
  });

  const feedItems =
    feedTab === 'saved'
      ? filteredFeed.filter((r) => savedIds.has(r.id))
      : feedTab === 'recent'
      ? [...filteredFeed].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      : filteredFeed; // 'best' — default relevance order; 'invites' handled separately below

  // Search-only match set (ignoring category/location) — used to compute facet counts
  const searchMatched = openJobs.filter(
    (req) =>
      req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.location.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const categoryCounts = CATEGORIES.filter((cat) => cat !== 'All').map((cat) => ({
    value: cat,
    count: searchMatched.filter((r) => r.category === cat).length,
  }));

  const locationCounts = LOCATIONS.map((loc) => ({
    ...loc,
    count: searchMatched.filter((r) => r.location.toLowerCase().includes(loc.value.toLowerCase())).length,
  }));

  const openFiltersModal = () => {
    setPendingCategory(selectedCategoryFilter);
    setPendingLocation(locationFilter);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setSelectedCategoryFilter(pendingCategory);
    setLocationFilter(pendingLocation);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setPendingCategory('All');
    setPendingLocation('All');
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Account Notice Banner */}
      {!noticeDismissed && (
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

      {/* Promo Card */}
      <div className="relative bg-ink text-white rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden">
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
          <Button variant="secondary" size="sm" onClick={() => navigate(`/profile/${currentUser.id}`)}>
            Complete Profile
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="p-1 text-zinc-500 hover:text-white cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="w-6 h-1 rounded-full bg-white" />
          <span className="w-6 h-1 rounded-full bg-zinc-600" />
          <button className="p-1 text-zinc-500 hover:text-white cursor-pointer">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

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
          <h2 className="text-lg font-bold text-ink">Jobs you might like</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Browse open client requests that match your services. Ordered by relevance.
          </p>
        </div>

        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            {(
              [
                ['best', 'Best matches'],
                ['recent', 'Most recent'],
                ['saved', `Saved (${savedIds.size})`],
                ['invites', 'Invites'],
              ] as [FeedTab, string][]
            ).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setFeedTab(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  feedTab === tab
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-white text-ink-muted hover:text-ink border border-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={openFiltersModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {(selectedCategoryFilter !== 'All' || locationFilter !== 'All') && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>
        </div>

        {feedTab === 'invites' ? (
          <EmptyState
            title="No invitations yet"
            description="When clients invite you directly to bid on a job, it will show up here."
          />
        ) : feedItems.length === 0 ? (
          <EmptyState
            title={feedTab === 'saved' ? 'No saved jobs' : 'No jobs match your filters'}
            description={
              feedTab === 'saved'
                ? 'Tap the heart icon on a job to save it here for later.'
                : 'Try adjusting your keyword search or category filters.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {feedItems.map((req) => (
              <div
                key={req.id}
                onClick={() => setSelectedJobId(req.id)}
                className="bg-white border border-border rounded-2xl p-5 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-surface-subtle text-[11px] font-bold text-primary border border-border">
                    {req.category}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissJob(req.id);
                      }}
                      title="Not interested"
                      className="text-zinc-400 hover:text-ink cursor-pointer"
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSaved(req.id);
                      }}
                      title="Save"
                      className={`cursor-pointer ${savedIds.has(req.id) ? 'text-rose-500' : 'text-zinc-400 hover:text-rose-500'}`}
                    >
                      <Heart className="w-4 h-4" fill={savedIds.has(req.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-ink line-clamp-2 leading-snug">{req.title}</h3>

                <p className="text-xs text-ink-muted line-clamp-3 leading-relaxed flex-1">
                  {req.description}
                </p>

                <div className="space-y-1.5 text-xs text-ink-muted pt-2 border-t border-border">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-primary">
                      ${req.budgetMin.toLocaleString()} - ${req.budgetMax.toLocaleString()}
                    </span>
                    <span className="shrink-0">{req.proposalsCount} proposals</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                    <span className="truncate">{req.location}</span>
                  </div>
                  {req.clientVerified && (
                    <span className="flex items-center gap-1 text-primary font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Payment Verified
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Job Overview Dialog */}
      <Dialog
        open={!!selectedJobId}
        onOpenChange={(open) => !open && setSelectedJobId(null)}
      >
        <DialogContent className="max-w-lg">
          {selectedJob && (
            <>
              <DialogHeader>
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-surface-subtle text-[11px] font-bold text-primary border border-border mb-2">
                    {selectedJob.category}
                  </span>
                  <DialogTitle>{selectedJob.title}</DialogTitle>
                  <DialogDescription>
                    Posted {new Date(selectedJob.createdAt).toLocaleDateString()} •{' '}
                    {selectedJob.proposalsCount} proposals
                  </DialogDescription>
                </div>
              </DialogHeader>

              <DialogBody className="space-y-4">
                <p className="text-xs text-ink leading-relaxed">{selectedJob.description}</p>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-bg border border-border rounded-xl">
                    <span className="block text-[10px] text-ink-muted uppercase font-mono">Budget</span>
                    <span className="font-bold text-primary">
                      ${selectedJob.budgetMin.toLocaleString()} - $
                      {selectedJob.budgetMax.toLocaleString()}
                    </span>
                  </div>
                  <div className="p-3 bg-bg border border-border rounded-xl">
                    <span className="flex items-center gap-1 text-[10px] text-ink-muted uppercase font-mono">
                      <Calendar className="w-3 h-3" /> Event Schedule
                    </span>
                    <span className="font-semibold text-ink">
                      {formatEventSchedule(
                        selectedJob.eventDate,
                        selectedJob.timingMode,
                        selectedJob.eventStartTime,
                        selectedJob.eventEndTime,
                      )}
                    </span>
                  </div>
                  <div className="p-3 bg-bg border border-border rounded-xl flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="font-semibold text-ink">{selectedJob.location}</span>
                  </div>
                  <div className="p-3 bg-bg border border-border rounded-xl flex items-center gap-2">
                    <CalendarClock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="font-semibold text-amber-700">
                      Due {selectedJob.proposalDeadline}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-ink-muted">
                  {selectedJob.clientVerified && (
                    <span className="flex items-center gap-1 text-primary font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Payment Verified
                    </span>
                  )}
                  <span>{selectedJob.clientCompany || selectedJob.clientName}</span>
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
                Filters will only apply to "Best matches" and "Most recent" searches.
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-ink uppercase tracking-wide">Category</h3>
              <div className="space-y-2.5">
                {categoryCounts.map(({ value, count }) => (
                  <label key={value} className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                    <Checkbox
                      checked={pendingCategory === value}
                      onCheckedChange={(checked) => setPendingCategory(checked ? value : 'All')}
                    />
                    <span className="flex-1">{value}</span>
                    <span className="text-ink-muted">({count})</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-border">
              <h3 className="text-xs font-bold text-ink uppercase tracking-wide">Location</h3>
              <div className="space-y-2.5">
                {locationCounts.map(({ value, label, count }) => (
                  <label key={value} className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                    <Checkbox
                      checked={pendingLocation === value}
                      onCheckedChange={(checked) => setPendingLocation(checked ? value : 'All')}
                    />
                    <span className="flex-1">{label}</span>
                    <span className="text-ink-muted">({count})</span>
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
