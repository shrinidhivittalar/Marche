import React from 'react';
import { ArrowLeft, BadgeCheck, MapPin } from 'lucide-react';
import { Button, Card } from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { marketplaceApi } from '../../lib/marketplace-api';

// A single listing. GET /services/:id existed and was tested from the day
// the API shipped with nothing calling it — a client could find a service
// in search and then had no way to open it, which for a marketplace is the
// click that matters.
//
// Public: no session required, matching the endpoint and phase_scope's
// guest browsing. No mock data — a hidden or missing listing 404s, and the
// page says so rather than inventing a placeholder.
export const ServiceDetailPage: React.FC<{ id: string }> = ({ id }) => {
  const { goBack, navigate } = useApp();

  const service = useApiResource(() => marketplaceApi.serviceById(id), [id]);

  if (service.loading) {
    return (
      <Card className="p-10 text-center" data-testid="service-detail-loading">
        <p className="text-ink-muted">Loading service…</p>
      </Card>
    );
  }

  if (service.error || !service.data) {
    return (
      <Card className="p-10 text-center space-y-3" data-testid="service-detail-error">
        {/* The API returns 404 for an unpublished listing exactly as it does
            for one that never existed, so nobody can probe for drafts. The
            wording here has to hold both cases without hinting otherwise. */}
        <p className="text-ink font-medium">This service isn&apos;t available.</p>
        <p className="text-ink-muted text-sm">
          It may have been removed, or it isn&apos;t published right now.
        </p>
        <Button variant="secondary" onClick={goBack} data-testid="service-detail-back-error">
          Back to search
        </Button>
      </Card>
    );
  }

  const s = service.data;

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="service-detail-page">
      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink"
        data-testid="service-detail-back"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <Card className="p-8 space-y-4">
        <div>
          <p className="text-xs text-ink-muted" data-testid="service-category">
            {s.category.name}
          </p>
          <h1 className="text-2xl font-bold text-ink" data-testid="service-title">
            {s.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-baseline gap-4">
          <p className="text-xl font-semibold text-ink" data-testid="service-price">
            ₹{s.startingPrice}
          </p>
          <p className="text-sm text-ink-muted" data-testid="service-delivery">
            Delivered in {s.deliveryDays} {s.deliveryDays === 1 ? 'day' : 'days'}
          </p>
        </div>

        {s.description && (
          <p className="text-sm text-ink whitespace-pre-line" data-testid="service-description">
            {s.description}
          </p>
        )}

        {s.skills.length > 0 && (
          <div className="space-y-2" data-testid="service-skills">
            <p className="text-xs font-medium text-ink-muted uppercase">Skills</p>
            <div className="flex flex-wrap gap-2">
              {s.skills.map((entry) => (
                <span
                  key={entry.skill.id}
                  className="rounded-full bg-surface-subtle border border-border px-3 py-1 text-sm"
                >
                  {entry.skill.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {s.tags.length > 0 && (
          <div className="space-y-2" data-testid="service-tag-list">
            <p className="text-xs font-medium text-ink-muted uppercase">Tags</p>
            <div className="flex flex-wrap gap-1">
              {s.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-8 space-y-4" data-testid="service-provider">
        <h2 className="text-lg font-semibold text-ink">About the provider</h2>

        <div className="flex items-start gap-4">
          {s.profile.avatar ? (
            <img
              src={s.profile.avatar}
              alt={s.profile.displayName}
              className="w-14 h-14 rounded-xl object-cover ring-2 ring-border"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-surface-subtle border border-border flex items-center justify-center text-lg font-semibold text-ink-muted">
              {s.profile.displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-ink" data-testid="service-provider-name">
                {s.profile.displayName}
              </p>
              {s.profile.verifiedAt && (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <BadgeCheck className="w-3.5 h-3.5" /> Verified
                </span>
              )}
            </div>
            {s.profile.headline && <p className="text-sm text-ink-muted">{s.profile.headline}</p>}
            <p className="text-xs text-ink-muted flex items-center gap-3 flex-wrap">
              {s.profile.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {s.profile.location}
                </span>
              )}
              <span>{s.profile.availabilityStatus}</span>
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          data-testid="service-view-provider"
          onClick={() => navigate(`/profile/${s.profile.id}`)}
        >
          View full profile
        </Button>
      </Card>
    </div>
  );
};
