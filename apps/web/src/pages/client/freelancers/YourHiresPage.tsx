import React from 'react';
import { Search } from 'lucide-react';
import { Button } from '@marche/ui';
import { FreelancersLayout } from './FreelancersLayout';


export const YourHiresPage: React.FC = () => (
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

    <div className="text-center space-y-4 rounded-2xl border border-dashed border-border bg-bg px-6 py-12">
      <p className="text-xs text-ink-muted">
        You haven't hired anyone yet. Start searching for the right fit for your next project.
      </p>
      <Button variant="outline" icon={Search}>
        Find Talent
      </Button>
    </div>
  </FreelancersLayout>
);
