import React, { useState } from 'react';
import { Search, Heart, ThumbsDown, ShieldCheck, MapPin, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Input, Checkbox } from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { CATEGORIES, LOCATIONS } from '../../data/categoryOptions';

type SortOption = 'best' | 'recent' | 'budget_high' | 'budget_low';

const BUDGET_BUCKETS = [
  { label: 'Under $3,000', test: (min: number) => min < 3000 },
  { label: '$3,000 – $5,000', test: (min: number) => min >= 3000 && min < 5000 },
  { label: '$5,000 – $8,000', test: (min: number) => min >= 5000 && min < 8000 },
  { label: '$8,000+', test: (min: number) => min >= 8000 },
];

const PROPOSAL_BUCKETS = [
  { label: 'Fewer than 3', test: (count: number) => count < 3 },
  { label: '3 to 5', test: (count: number) => count >= 3 && count <= 5 },
  { label: 'More than 5', test: (count: number) => count > 5 },
];

function timeAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  return `Posted ${days} days ago`;
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-border pb-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between text-xs font-bold text-ink uppercase tracking-wide mb-3 cursor-pointer"
      >
        {title}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

export const SearchJobsPage: React.FC = () => {
  const { requirements, navigate } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('best');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedBudgets, setSelectedBudgets] = useState<Set<string>>(new Set());
  const [selectedProposalBuckets, setSelectedProposalBuckets] = useState<Set<string>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const toggleInSet = (set: Set<string>, setter: (s: Set<string>) => void, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const openJobs = requirements.filter((r) => !dismissedIds.has(r.id));

  const searchMatched = openJobs.filter(
    (r) =>
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categoryCounts = CATEGORIES.filter((c) => c !== 'All').map((cat) => ({
    value: cat,
    count: searchMatched.filter((r) => r.category === cat).length,
  }));

  const budgetCounts = BUDGET_BUCKETS.map((b) => ({
    ...b,
    count: searchMatched.filter((r) => b.test(r.budgetMin)).length,
  }));

  const proposalCounts = PROPOSAL_BUCKETS.map((b) => ({
    ...b,
    count: searchMatched.filter((r) => b.test(r.proposalsCount)).length,
  }));

  const locationCounts = LOCATIONS.map((loc) => ({
    ...loc,
    count: searchMatched.filter((r) => r.location.toLowerCase().includes(loc.value.toLowerCase())).length,
  }));

  const verifiedCount = searchMatched.filter((r) => r.clientVerified).length;

  const filteredJobs = searchMatched.filter((r) => {
    const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(r.category);
    const matchesBudget =
      selectedBudgets.size === 0 ||
      BUDGET_BUCKETS.some((b) => selectedBudgets.has(b.label) && b.test(r.budgetMin));
    const matchesProposals =
      selectedProposalBuckets.size === 0 ||
      PROPOSAL_BUCKETS.some((b) => selectedProposalBuckets.has(b.label) && b.test(r.proposalsCount));
    const matchesLocation =
      selectedLocations.size === 0 ||
      LOCATIONS.some((loc) => selectedLocations.has(loc.value) && r.location.toLowerCase().includes(loc.value.toLowerCase()));
    const matchesVerified = !verifiedOnly || r.clientVerified;
    return matchesCategory && matchesBudget && matchesProposals && matchesLocation && matchesVerified;
  });

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    if (sortBy === 'recent') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortBy === 'budget_high') return b.budgetMax - a.budgetMax;
    if (sortBy === 'budget_low') return a.budgetMax - b.budgetMax;
    return 0; // 'best' — default relevance order
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">Search Jobs</h1>
        <p className="text-xs text-ink-muted mt-1">
          Filter open requirements by budget, category, and client details to find your next event.
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-xl">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-400 pointer-events-none" />
        <Input
          type="text"
          placeholder="Search jobs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-border rounded-xl pl-10 pr-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filter Sidebar */}
        <aside className="lg:col-span-1 space-y-4">
          <FilterSection title="Category">
            {categoryCounts.map(({ value, count }) => (
              <label key={value} className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <Checkbox
                  checked={selectedCategories.has(value)}
                  onCheckedChange={() => toggleInSet(selectedCategories, setSelectedCategories, value)}
                />
                <span className="flex-1">{value}</span>
                <span className="text-ink-muted">({count})</span>
              </label>
            ))}
          </FilterSection>

          <FilterSection title="Budget">
            {budgetCounts.map(({ label, count }) => (
              <label key={label} className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <Checkbox
                  checked={selectedBudgets.has(label)}
                  onCheckedChange={() => toggleInSet(selectedBudgets, setSelectedBudgets, label)}
                />
                <span className="flex-1">{label}</span>
                <span className="text-ink-muted">({count})</span>
              </label>
            ))}
          </FilterSection>

          <FilterSection title="Number of Proposals">
            {proposalCounts.map(({ label, count }) => (
              <label key={label} className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <Checkbox
                  checked={selectedProposalBuckets.has(label)}
                  onCheckedChange={() => toggleInSet(selectedProposalBuckets, setSelectedProposalBuckets, label)}
                />
                <span className="flex-1">{label}</span>
                <span className="text-ink-muted">({count})</span>
              </label>
            ))}
          </FilterSection>

          <FilterSection title="Client Info">
            <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
              <Checkbox checked={verifiedOnly} onCheckedChange={(c) => setVerifiedOnly(!!c)} />
              <span className="flex-1">Payment Verified</span>
              <span className="text-ink-muted">({verifiedCount})</span>
            </label>
          </FilterSection>

          <FilterSection title="Location">
            {locationCounts.map(({ value, label, count }) => (
              <label key={value} className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                <Checkbox
                  checked={selectedLocations.has(value)}
                  onCheckedChange={() => toggleInSet(selectedLocations, setSelectedLocations, value)}
                />
                <span className="flex-1">{label}</span>
                <span className="text-ink-muted">({count})</span>
              </label>
            ))}
          </FilterSection>
        </aside>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">{sortedJobs.length} jobs found</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-ink cursor-pointer focus:outline-none focus:border-primary"
            >
              <option value="best">Sort by: Best Matches</option>
              <option value="recent">Sort by: Most Recent</option>
              <option value="budget_high">Sort by: Budget High to Low</option>
              <option value="budget_low">Sort by: Budget Low to High</option>
            </select>
          </div>

          {sortedJobs.length === 0 ? (
            <EmptyState
              title="No jobs match your filters"
              description="Try adjusting your search keyword or clearing a few filters."
            />
          ) : (
            <div className="space-y-3">
              {sortedJobs.map((req) => (
                <div
                  key={req.id}
                  onClick={() => navigate(`/provider/requirements/${req.id}`)}
                  className="bg-white border border-border rounded-2xl p-5 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[11px] text-ink-muted mb-1.5">
                        <span>{timeAgo(req.createdAt)}</span>
                        <span>•</span>
                        <span>Proposals: {req.proposalsCount}</span>
                      </div>
                      <h3 className="text-sm font-bold text-ink">{req.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDismissedIds((prev) => new Set(prev).add(req.id));
                        }}
                        title="Not interested"
                        className="text-zinc-400 hover:text-ink cursor-pointer"
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleInSet(savedIds, setSavedIds, req.id);
                        }}
                        title="Save"
                        className={`cursor-pointer ${savedIds.has(req.id) ? 'text-rose-500' : 'text-zinc-400 hover:text-rose-500'}`}
                      >
                        <Heart className="w-4 h-4" fill={savedIds.has(req.id) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-ink-muted mt-2">
                    {req.clientVerified && (
                      <span className="flex items-center gap-1 text-primary font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Payment Verified
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {req.location}
                    </span>
                  </div>

                  <p className="text-xs text-ink mt-2">
                    <span className="font-semibold text-primary">
                      ${req.budgetMin.toLocaleString()} - ${req.budgetMax.toLocaleString()}
                    </span>{' '}
                    · {req.category}
                  </p>

                  <p className="text-xs text-ink-muted line-clamp-2 leading-relaxed mt-2">{req.description}</p>

                  {req.deliverables.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {req.deliverables.slice(0, 3).map((d) => (
                        <span
                          key={d}
                          className="px-2.5 py-1 rounded-lg bg-surface-subtle text-[10px] font-medium text-ink-muted border border-border"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
