import React from 'react';
import { MapPin, Search, ShieldCheck } from 'lucide-react';
import { Button, Card } from '@marche/ui';
import { useApp } from '../../../context/AppContext';
import { FreelancersLayout } from './FreelancersLayout';

export const YourHiresPage: React.FC = () => {
  const { navigate, currentUser, contracts, talentProfiles } = useApp();

  const myContracts = contracts.filter((c) => c.clientId === currentUser.id);
  const hiredVendorIds = Array.from(new Set(myContracts.map((c) => c.vendorId)));

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

      {hiredVendorIds.length === 0 ? (
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
          {hiredVendorIds.map((vendorId) => {
            const vendorContracts = myContracts.filter((c) => c.vendorId === vendorId);
            const latest = vendorContracts[vendorContracts.length - 1];
            const talent = talentProfiles.find((t) => t.id === vendorId);

            if (!latest) return null;

            return (
              <Card
                key={vendorId}
                padding="md"
                className="cursor-pointer hover:border-border-strong hover:shadow-md transition-all"
                onClick={() => navigate('/profile/' + vendorId)}
              >
                <div className="flex items-start gap-4">
                  <img
                    src={talent?.portfolioImage || latest.vendorAvatar}
                    alt=""
                    className="w-16 h-16 rounded-xl object-cover border border-border shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h2 className="text-sm font-bold text-ink truncate">{latest.vendorName}</h2>
                      {talent?.verified && <ShieldCheck className="w-4 h-4 text-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {vendorContracts.length} job{vendorContracts.length === 1 ? '' : 's'} together
                    </p>
                    {talent && (
                      <p className="flex items-center gap-1 text-[11px] text-ink-muted mt-1">
                        <MapPin className="w-3 h-3" />
                        {talent.location}
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
