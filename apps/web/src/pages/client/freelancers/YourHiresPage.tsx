import React from 'react';
import { MapPin, Search, ShieldCheck } from 'lucide-react';
import { Button, Card } from '@marche/ui';
import { useApp } from '../../../context/AppContext';
import { FreelancersLayout } from './FreelancersLayout';
import { useApiResource } from '../../../hooks/useApiResource';
import { connectionsApi } from '../../../lib/proposals-api';

export const YourHiresPage: React.FC = () => {
  const { navigate, accessToken } = useApp();

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
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Your hires</h1>
          <p className="text-xs text-ink-muted mt-1">Look up people you've worked with</p>
        </div>
        <button className="px-3.5 py-1.5 rounded-full border border-border text-xs font-semibold text-ink-muted whitespace-nowrap">
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
