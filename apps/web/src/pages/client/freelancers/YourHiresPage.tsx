import React from 'react';
import { CheckCircle2, MapPin, Search, ShieldCheck } from 'lucide-react';
import { Button, Card } from '@marche/ui';
import { useApp } from '../../../context/AppContext';
import { FreelancersLayout } from './FreelancersLayout';
import { useApiResource } from '../../../hooks/useApiResource';
import { connectionsApi } from '../../../lib/proposals-api';

export const YourHiresPage: React.FC = () => {
  const { navigate, accessToken } = useApp();

  // Toast feedback — same pattern as ClientDashboard's showToast.
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // The client's real connections, grouped by provider — the mock
  // `contracts`/`talentProfiles` this replaced only ever held demo fixture
  // data (see ClientDashboard.tsx for why).
  const myConnections = useApiResource(
    () => connectionsApi.mine(accessToken as string, 1, 50),
    [accessToken],
    { enabled: Boolean(accessToken) },
  );
  const connectionItems = myConnections.data?.items ?? [];

  const hiredProviderIds = Array.from(new Set(connectionItems.map((c) => c.providerProfile.id)));

  return (
    <FreelancersLayout activeItem="Your hires">
      {toastMessage && (
        <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-primary-hover" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Your hires</h1>
          <p className="text-xs text-ink-muted mt-1">Look up people you've worked with</p>
        </div>
        <button
          type="button"
          onClick={() =>
            showToast(
              "Sharing a hire list isn't wired up yet — Marché is still a frontend preview.",
            )
          }
          className="px-3.5 py-1.5 rounded-full border border-border text-xs font-semibold text-ink-muted whitespace-nowrap cursor-pointer"
        >
          Share list
        </button>
      </div>

      {hiredProviderIds.length === 0 ? (
        <div className="text-center space-y-4 rounded-2xl border border-dashed border-border bg-bg px-6 py-12">
          <p className="text-xs text-ink-muted">
            You haven't hired anyone yet. Start searching for the right fit for your next project.
          </p>
          <Button variant="outline" icon={Search} onClick={() => navigate('/client/search')}>
            Find Talent
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {hiredProviderIds.map((providerId) => {
            const providerConnections = connectionItems.filter(
              (c) => c.providerProfile.id === providerId,
            );
            const latest = providerConnections[providerConnections.length - 1];

            if (!latest) return null;
            const provider = latest.providerProfile;

            return (
              <Card
                key={providerId}
                padding="md"
                className="cursor-pointer hover:border-border-strong hover:shadow-md transition-all"
                onClick={() => navigate('/profile/' + providerId)}
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-xl border border-border bg-surface-subtle flex items-center justify-center text-lg font-semibold text-ink-muted shrink-0">
                    {provider.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h2 className="text-sm font-bold text-ink truncate">
                        {provider.displayName}
                      </h2>
                      {provider.verifiedAt && (
                        <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {providerConnections.length} job{providerConnections.length === 1 ? '' : 's'}{' '}
                      together
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {providerConnections.map((connection) => (
                        <button
                          key={connection.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/client/jobs/' + connection.job.id);
                          }}
                          className="px-2 py-0.5 rounded-md bg-surface-subtle border border-border text-[11px] font-medium text-ink-muted hover:text-ink hover:border-border-strong cursor-pointer truncate max-w-[10rem]"
                          title={connection.job.title}
                        >
                          {connection.job.title}
                        </button>
                      ))}
                    </div>
                    {provider.location && (
                      <p className="flex items-center gap-1 text-[11px] text-ink-muted mt-1">
                        <MapPin className="w-3 h-3" />
                        {provider.location}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </FreelancersLayout>
  );
};
