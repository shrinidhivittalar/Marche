import React from 'react';
import { CheckCircle2, Heart, MapPin, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { Button, Card } from '@marche/ui';
import { EmptyState } from '../../../components/common/EmptyState';
import { useApp } from '../../../context/AppContext';
import { useApiResource } from '../../../hooks/useApiResource';
import { savedProvidersApi } from '../../../lib/saved-providers-api';
import { FreelancersLayout } from './FreelancersLayout';

export const SavedTalentPage: React.FC = () => {
  const { navigate, accessToken } = useApp();
  const token = accessToken as string;

  const saved = useApiResource(() => savedProvidersApi.mine(token, 1, 50), [token], {
    enabled: Boolean(token),
  });
  const savedTalent = saved.data?.items ?? [];

  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleRemove = async (providerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await savedProvidersApi.unsave(token, providerId);
      void saved.refetch();
    } catch {
      showToast('Could not remove this provider — please try again.');
    }
  };

  return (
    <FreelancersLayout activeItem="Saved talent">
      {toastMessage && (
        <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-primary-hover" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Saved talent</h1>
          <p className="text-xs text-ink-muted mt-1">
            {savedTalent.length > 0
              ? savedTalent.length +
                ' provider' +
                (savedTalent.length === 1 ? '' : 's') +
                ' saved for later'
              : 'Keep a shortlist of providers you may want to hire.'}
          </p>
        </div>
        <Button variant="outline" icon={Search} onClick={() => navigate('/client/search')}>
          Find Talent
        </Button>
      </div>

      {saved.loading ? (
        <p className="text-xs text-ink-muted py-12 text-center">Loading saved talent…</p>
      ) : savedTalent.length === 0 ? (
        <EmptyState
          title="No saved talent yet"
          description="Save providers from talent search or a profile page and they'll show up here."
          icon={Heart}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {savedTalent.map((talent) => (
            <Card
              key={talent.id}
              padding="md"
              className="group cursor-pointer hover:border-border-strong hover:shadow-md transition-all"
              onClick={() => navigate('/profile/' + talent.id)}
            >
              <div className="flex items-start gap-4">
                {talent.avatar ? (
                  <img
                    src={talent.avatar}
                    alt=""
                    className="w-24 h-24 rounded-xl object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-xl border border-border bg-surface-subtle flex items-center justify-center text-2xl font-semibold text-ink-muted shrink-0">
                    {talent.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h2 className="text-sm font-bold text-ink truncate">
                          {talent.displayName}
                        </h2>
                        {talent.verifiedAt && (
                          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </div>
                      {talent.headline && (
                        <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">
                          {talent.headline}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      title="Remove from saved talent"
                      aria-label="Remove from saved talent"
                      onClick={(e) => handleRemove(talent.id, e)}
                      className="w-8 h-8 rounded-md border border-border flex items-center justify-center text-ink-muted hover:text-danger hover:border-danger/30 hover:bg-danger-subtle transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-muted mt-2">
                    {talent.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {talent.location}
                      </span>
                    )}
                    <span className="capitalize">{talent.availabilityStatus.toLowerCase()}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </FreelancersLayout>
  );
};
