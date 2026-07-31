import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Button, Input } from '@marche/ui';

const ORG_SIZES = ['Just me', '2 - 9', '10 - 99', '100 - 499', '500 - 4,999', '5,000+'];

export const ClientOnboardingPage: React.FC = () => {
  const { currentUser, updateCurrentUser, navigate } = useApp();
  const [companyName, setCompanyName] = useState(currentUser.companyOrTitle || currentUser.name);
  const [website, setWebsite] = useState(currentUser.website ?? '');
  const [orgSize, setOrgSize] = useState<string | null>(currentUser.orgSize ?? null);

  const handleContinue = () => {
    updateCurrentUser({ companyOrTitle: companyName, website, orgSize: orgSize ?? undefined });
    navigate('/client/dashboard');
  };

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-6 sm:px-10 py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg tracking-tight shadow-xs shrink-0">M</div>
          <span className="text-lg font-extrabold tracking-tight text-ink">MARCHÉ</span>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-6 pb-16 space-y-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-ink tracking-tight">Welcome to Marché!</h1>
          <p className="text-sm text-ink-muted mt-2">Tell us about your business and you'll be on your way to connect with talent.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-1">Company Name</label>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-1">Website</label>
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-2">How many people are in your organization?</label>
          <div className="flex flex-wrap gap-2.5">
            {ORG_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setOrgSize(size)}
                className={`px-4 py-2 rounded-full border text-xs font-medium cursor-pointer transition-all ${
                  orgSize === size ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border bg-white text-ink hover:border-zinc-300'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button size="lg" onClick={handleContinue} disabled={!companyName.trim() || !orgSize}>Continue</Button>
        </div>
      </div>
    </div>
  );
};
