import React, { useState } from 'react';
import { Button, Card, Input } from '@marche/ui';
import { useApiResource } from '../../hooks/useApiResource';
import { useApp } from '../../context/AppContext';
import {
  marketplaceApi,
  type AvailabilityStatus,
  type ServiceSort,
  type ServiceSearchParams,
} from '../../lib/marketplace-api';

// Public discovery for Module 3. No authentication: guests browse the
// marketplace, which is what phase_scope calls for.
//
// Only the three sorts the API actually supports are offered. "Relevance"
// and "Rating" are rejected with a 400 until the Reviews module exists, so
// rendering them would be offering the user a button that errors.
const SORTS: { value: ServiceSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_low', label: 'Price: low to high' },
  { value: 'price_high', label: 'Price: high to low' },
];

const AVAILABILITY: AvailabilityStatus[] = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'];
const PAGE_SIZE = 12;

type Mode = 'services' | 'providers';

export const BrowseServicesPage: React.FC = () => {
  const { navigate } = useApp();

  const [mode, setMode] = useState<Mode>('services');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [availability, setAvailability] = useState<AvailabilityStatus | ''>('');
  const [sort, setSort] = useState<ServiceSort>('newest');
  const [page, setPage] = useState(1);

  // Applied separately from the input state so typing does not fire a
  // request per keystroke, and so pressing Search is what resets the page.
  const [applied, setApplied] = useState<ServiceSearchParams>({});

  const categories = useApiResource(() => marketplaceApi.categories(), []);

  const params: ServiceSearchParams = { ...applied, sort, page, limit: PAGE_SIZE };

  const services = useApiResource(
    () => marketplaceApi.searchServices(params),
    [JSON.stringify(applied), sort, page, mode],
    { enabled: mode === 'services' },
  );
  const providers = useApiResource(
    () => marketplaceApi.searchProviders(params),
    [JSON.stringify(applied), sort, page, mode],
    { enabled: mode === 'providers' },
  );

  const active = mode === 'services' ? services : providers;

  const applyFilters = () => {
    setPage(1);
    setApplied({
      q: q || undefined,
      category: category || undefined,
      location: location || undefined,
      // Blank inputs must become undefined, not 0 — a minPrice of 0 is a
      // real filter and would silently exclude nothing while looking set.
      minPrice: minPrice === '' ? undefined : Number(minPrice),
      maxPrice: maxPrice === '' ? undefined : Number(maxPrice),
      availability: availability || undefined,
    });
  };

  const clearFilters = () => {
    setQ('');
    setCategory('');
    setLocation('');
    setMinPrice('');
    setMaxPrice('');
    setAvailability('');
    setSort('newest');
    setPage(1);
    setApplied({});
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6" data-testid="browse-page">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Find providers</h1>
        <p className="text-muted text-sm mt-1">Search published services across the marketplace.</p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex gap-2">
          <Button
            variant={mode === 'services' ? 'primary' : 'secondary'}
            data-testid="mode-services"
            onClick={() => {
              setMode('services');
              setPage(1);
            }}
          >
            Services
          </Button>
          <Button
            variant={mode === 'providers' ? 'primary' : 'secondary'}
            data-testid="mode-providers"
            onClick={() => {
              setMode('providers');
              setPage(1);
            }}
          >
            Providers
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            placeholder="Search services…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            data-testid="filter-q"
            aria-label="Search services"
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            data-testid="filter-category"
            aria-label="Category"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">All categories</option>
            {(categories.data ?? []).map((parent) => (
              <optgroup key={parent.id} label={parent.name}>
                <option value={parent.slug}>All {parent.name}</option>
                {(parent.children ?? []).map((child) => (
                  <option key={child.id} value={child.slug}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <Input
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            data-testid="filter-location"
            aria-label="Location"
          />

          <Input
            type="number"
            placeholder="Min price"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            data-testid="filter-minPrice"
            aria-label="Minimum price"
          />
          <Input
            type="number"
            placeholder="Max price"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            data-testid="filter-maxPrice"
            aria-label="Maximum price"
          />

          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value as AvailabilityStatus | '')}
            data-testid="filter-availability"
            aria-label="Availability"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">Any availability</option>
            {AVAILABILITY.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={applyFilters} data-testid="apply-filters">
            Search
          </Button>
          <Button variant="secondary" onClick={clearFilters} data-testid="clear-filters">
            Clear
          </Button>

          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as ServiceSort);
              setPage(1);
            }}
            data-testid="filter-sort"
            aria-label="Sort by"
            className="ml-auto rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {active.loading && (
        <Card className="p-8" data-testid="results-loading">
          <p className="text-muted">Searching…</p>
        </Card>
      )}

      {active.error && (
        <Card className="p-8 space-y-3" data-testid="results-error">
          <p className="text-danger">{active.error}</p>
          <Button onClick={() => void active.refetch()} data-testid="results-retry">
            Try again
          </Button>
        </Card>
      )}

      {!active.loading && !active.error && active.data && (
        <>
          <p className="text-sm text-muted" data-testid="results-count">
            {active.data.total} {active.data.total === 1 ? 'result' : 'results'}
          </p>

          {active.data.items.length === 0 ? (
            <Card className="p-10 text-center space-y-2" data-testid="results-empty">
              <p className="text-ink font-medium">No results found.</p>
              <p className="text-muted text-sm">
                Try changing your filters or searching for another service.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="results-grid">
              {mode === 'services'
                ? (services.data?.items ?? []).map((s) => (
                    <Card
                      key={s.id}
                      className="p-5 space-y-3"
                      data-testid="service-card"
                      data-service-title={s.title}
                    >
                      <div>
                        <h3 className="font-semibold text-ink">{s.title}</h3>
                        <p className="text-xs text-muted">{s.category.name}</p>
                      </div>
                      <p className="text-sm text-ink">
                        From ₹{s.startingPrice} · {s.deliveryDays} days
                      </p>
                      <p className="text-xs text-muted">
                        {s.profile.displayName}
                        {s.profile.location ? ` · ${s.profile.location}` : ''}
                      </p>
                      {s.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1" data-testid="service-tags">
                          {s.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-surface-subtle border border-border px-2 py-0.5 text-[11px]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <Button
                        variant="secondary"
                        data-testid={`view-provider-${s.profile.id}`}
                        onClick={() => navigate(`/profile/${s.profile.id}`)}
                      >
                        View profile
                      </Button>
                    </Card>
                  ))
                : (providers.data?.items ?? []).map((p) => (
                    <Card
                      key={p.id}
                      className="p-5 space-y-3"
                      data-testid="provider-card"
                      data-provider-name={p.displayName}
                    >
                      <div>
                        <h3 className="font-semibold text-ink">{p.displayName}</h3>
                        <p className="text-xs text-muted">{p.headline ?? 'Service provider'}</p>
                      </div>
                      {p.startingFrom && <p className="text-sm text-ink">From ₹{p.startingFrom}</p>}
                      <p className="text-xs text-muted">
                        {p.location ?? 'Location not set'} · {p.availabilityStatus}
                      </p>
                      <Button
                        variant="secondary"
                        data-testid={`view-provider-${p.id}`}
                        onClick={() => navigate(`/profile/${p.id}`)}
                      >
                        View profile
                      </Button>
                    </Card>
                  ))}
            </div>
          )}

          {active.data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3" data-testid="pagination">
              <Button
                variant="secondary"
                disabled={!active.data.hasPrevious}
                data-testid="page-prev"
                onClick={() => setPage((n) => Math.max(1, n - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted" data-testid="page-indicator">
                Page {active.data.page} of {active.data.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={!active.data.hasNext}
                data-testid="page-next"
                onClick={() => setPage((n) => n + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
