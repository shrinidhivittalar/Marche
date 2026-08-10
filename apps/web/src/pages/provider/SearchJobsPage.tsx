import React, { useState } from 'react';
import {
  Search,
  Heart,
  ThumbsDown,
  ShieldCheck,
  MapPin,
  Calendar,
  ChevronDown,
  SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  Input,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@marche/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { LOCATIONS } from '../../data/categoryOptions';
import { useApiResource } from '../../hooks/useApiResource';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { marketplaceApi } from '../../lib/marketplace-api';
import { jobsApi, type ApiJob, type JobSort } from '../../lib/jobs-api';
import { formatJobBudget, formatEventWhen, postedAgo } from '../../lib/formatJob';

// Provider-side requirement discovery, on the real Jobs API.
//
// Filtering moved from the browser to the server, which changed what this
// screen can offer. The mock filtered an array it already held, so any
// combination was free; the API paginates, and a filter applied after
// pagination would silently hide results and report a wrong total.
//
// Consequences, each deliberate:
//
// - Category and budget are single-select. GET /jobs takes one category
//   slug and one budget range, and firing a request per checkbox to union
//   the results client-side would break the page count.
// - Facet counts are gone. They were computed from the full array; with
//   pagination the server would have to aggregate them, which is an
//   endpoint Module 4 does not have.
// - The proposal-count filter is gone. Proposals are Module 5, and there
//   is nothing to count yet.
// - "Best matches" is gone. The API rejects a relevance sort rather than
//   quietly aliasing it, because nothing ranks requirements in Phase 1.
//
// Saved and dismissed stay in local state exactly as before: they were
// never persisted in the mock either, and giving them a backend is its own
// feature.

type BudgetBucket = { label: string; minBudget?: number; maxBudget?: number };

const ANY_BUDGET: BudgetBucket = { label: 'Any budget' };

const BUDGET_BUCKETS: BudgetBucket[] = [
  ANY_BUDGET,
  { label: 'Under ₹3,000', maxBudget: 3000 },
  { label: '₹3,000 – ₹5,000', minBudget: 3000, maxBudget: 5000 },
  { label: '₹5,000 – ₹8,000', minBudget: 5000, maxBudget: 8000 },
  { label: '₹8,000+', minBudget: 8000 },
];

const SORT_LABELS: Record<JobSort, string> = {
  newest: 'Sort by: Most Recent',
  event_date: 'Sort by: Event Date',
  budget_high: 'Sort by: Budget High to Low',
  budget_low: 'Sort by: Budget Low to High',
};

const PAGE_SIZE = 20;

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
  const { navigate, searchQuery, setSearchQuery } = useApp();

  const [sortBy, setSortBy] = useState<JobSort>('newest');
  const [categorySlug, setCategorySlug] = useState<string>('');
  const [budgetLabel, setBudgetLabel] = useState<string>('Any budget');
  const [location, setLocation] = useState<string>('');
  const [page, setPage] = useState(1);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Typing must not fire a request per keystroke. The hook's generation
  // counter already drops out-of-order responses; this stops them being
  // sent at all.
  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  const budget = BUDGET_BUCKETS.find((b) => b.label === budgetLabel) ?? ANY_BUDGET;

  // Real categories, because the API matches on a seeded slug rather than
  // the display names the mock hardcoded.
  const categories = useApiResource(() => marketplaceApi.categories(), []);

  const jobs = useApiResource(
    () =>
      jobsApi.search({
        q: debouncedQuery || undefined,
        category: categorySlug || undefined,
        location: location || undefined,
        minBudget: budget.minBudget,
        maxBudget: budget.maxBudget,
        sort: sortBy,
        page,
        limit: PAGE_SIZE,
      }),
    [debouncedQuery, categorySlug, location, budget.label, sortBy, page],
  );

  // Applied after the fetch on purpose: dismissing is a local preference,
  // not a filter, so it must not change the page count the server reported.
  const visible = (jobs.data?.items ?? []).filter((job) => !dismissedIds.has(job.id));

  const changeFilter = (apply: () => void) => {
    apply();
    // Any filter change invalidates the current page number: page 3 of the
    // old result set is rarely page 3 of the new one.
    setPage(1);
  };

  const toggleSaved = (id: string) => {
    const next = new Set(savedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSavedIds(next);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
          Search Requirements
        </h1>
        <p className="text-xs text-ink-muted mt-1">
          Filter published requirements by budget, category and location to find your next event.
        </p>
      </div>

      <div className="relative max-w-xl">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-ink-muted pointer-events-none" />
        <Input
          type="text"
          placeholder="Search requirements..."
          value={searchQuery}
          onChange={(e) => changeFilter(() => setSearchQuery(e.target.value))}
          data-testid="job-search-input"
          className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2.5 text-xs text-ink focus:outline-none focus:border-primary"
        />
      </div>

      <button
        type="button"
        onClick={() => setMobileFiltersOpen((prev) => !prev)}
        className="lg:hidden w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border bg-surface text-xs font-semibold text-ink cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside
          className={`lg:col-span-1 space-y-4 ${mobileFiltersOpen ? 'block' : 'hidden'} lg:block`}
        >
          {/* Single-select, because the API filters on one category slug.
              Rendered as checkboxes to keep the existing look, but they
              behave as radios — selecting one clears the rest. */}
          <FilterSection title="Category">
            <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
              <Checkbox
                checked={categorySlug === ''}
                onCheckedChange={() => changeFilter(() => setCategorySlug(''))}
              />
              <span className="flex-1">All categories</span>
            </label>
            {(categories.data ?? []).map((category) => (
              <label
                key={category.id}
                className="flex items-center gap-2.5 text-xs text-ink cursor-pointer"
              >
                <Checkbox
                  checked={categorySlug === category.slug}
                  onCheckedChange={() => changeFilter(() => setCategorySlug(category.slug))}
                />
                <span className="flex-1">{category.name}</span>
              </label>
            ))}
            {categories.error && (
              <p className="text-[11px] text-danger" data-testid="categories-error">
                Categories could not be loaded.
              </p>
            )}
          </FilterSection>

          <FilterSection title="Budget">
            {BUDGET_BUCKETS.map(({ label }) => (
              <label
                key={label}
                className="flex items-center gap-2.5 text-xs text-ink cursor-pointer"
              >
                <Checkbox
                  checked={budgetLabel === label}
                  onCheckedChange={() => changeFilter(() => setBudgetLabel(label))}
                />
                <span className="flex-1">{label}</span>
              </label>
            ))}
            {/* Said plainly, because a provider filtering on pay would
                otherwise wonder where the unpriced requirements went. */}
            <p className="text-[11px] text-ink-muted pt-1">
              Requirements without a stated budget are hidden while a budget filter is on.
            </p>
          </FilterSection>

          <FilterSection title="Location">
            <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
              <Checkbox
                checked={location === ''}
                onCheckedChange={() => changeFilter(() => setLocation(''))}
              />
              <span className="flex-1">Anywhere</span>
            </label>
            {LOCATIONS.map((loc) => (
              <label
                key={loc.value}
                className="flex items-center gap-2.5 text-xs text-ink cursor-pointer"
              >
                <Checkbox
                  checked={location === loc.value}
                  onCheckedChange={() => changeFilter(() => setLocation(loc.value))}
                />
                <span className="flex-1">{loc.label}</span>
              </label>
            ))}
          </FilterSection>
        </aside>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-ink-muted" data-testid="job-result-count">
              {jobs.loading ? 'Searching…' : `${jobs.data?.total ?? 0} requirements found`}
            </span>
            <Select
              value={sortBy}
              onValueChange={(v) => changeFilter(() => setSortBy(v as JobSort))}
            >
              <SelectTrigger className="h-auto w-auto min-w-0 gap-2 rounded-lg px-2.5 py-1.5 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as JobSort[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {SORT_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {jobs.error ? (
            <EmptyState
              title="Requirements could not be loaded"
              description={jobs.error}
              actionLabel="Try again"
              onAction={() => void jobs.refetch()}
            />
          ) : !jobs.loading && visible.length === 0 ? (
            <EmptyState
              title="No requirements match your filters"
              description="Try adjusting your search keyword or clearing a few filters."
            />
          ) : (
            <div className="space-y-3" data-testid="job-results">
              {visible.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  saved={savedIds.has(job.id)}
                  onOpen={() => navigate(`/provider/jobs/${job.id}`)}
                  onSave={() => toggleSaved(job.id)}
                  onDismiss={() => setDismissedIds((prev) => new Set(prev).add(job.id))}
                />
              ))}
            </div>
          )}

          {(jobs.data?.totalPages ?? 0) > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={!jobs.data?.hasPrevious}
                onClick={() => setPage((p) => p - 1)}
                data-testid="jobs-prev-page"
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-ink disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-xs text-ink-muted">
                Page {jobs.data?.page} of {jobs.data?.totalPages}
              </span>
              <button
                type="button"
                disabled={!jobs.data?.hasNext}
                onClick={() => setPage((p) => p + 1)}
                data-testid="jobs-next-page"
                className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-ink disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function JobCard({
  job,
  saved,
  onOpen,
  onSave,
  onDismiss,
}: {
  job: ApiJob;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const when = formatEventWhen(job);

  return (
    <div
      onClick={onOpen}
      data-testid="job-result"
      data-job-title={job.title}
      className="bg-surface border border-border rounded-2xl p-5 hover:border-border-strong hover:shadow-md transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-ink-muted mb-1.5 flex-wrap">
            <span>{postedAgo(job.publishedAt ?? job.createdAt)}</span>
            <span>•</span>
            <span>{job.clientProfile.displayName}</span>
          </div>
          <h3 className="text-sm font-bold text-ink break-words">{job.title}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            title="Not interested"
            className="text-ink-muted hover:text-ink cursor-pointer"
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            title="Save"
            className={`cursor-pointer ${saved ? 'text-rose-500' : 'text-ink-muted hover:text-rose-500'}`}
          >
            <Heart className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-ink-muted mt-2 flex-wrap">
        {job.clientProfile.verifiedAt && (
          <span className="flex items-center gap-1 text-primary font-semibold shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
            Verified client
          </span>
        )}
        {job.location && (
          <span className="flex items-center gap-1 min-w-0">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{job.location}</span>
          </span>
        )}
        {when && (
          <span className="flex items-center gap-1 min-w-0">
            <Calendar className="w-3 h-3 shrink-0" />
            <span className="truncate">{when}</span>
          </span>
        )}
      </div>

      <p className="text-xs text-ink mt-2 break-words">
        <span className="font-semibold text-primary">{formatJobBudget(job)}</span> ·{' '}
        {job.category.name}
      </p>

      <p className="text-xs text-ink-muted line-clamp-2 leading-relaxed mt-2">{job.description}</p>

      {job.deliverables.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {job.deliverables.slice(0, 3).map((deliverable) => (
            <span
              key={deliverable}
              className="px-2.5 py-1 rounded-lg bg-surface-subtle text-[10px] font-medium text-ink-muted border border-border"
            >
              {deliverable}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
