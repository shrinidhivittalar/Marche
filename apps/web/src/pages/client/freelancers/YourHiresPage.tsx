import React from 'react';
import { Search, User } from 'lucide-react';
import { Button } from '@marche/ui';
import { FreelancersLayout } from './FreelancersLayout';

const CARDS = ['An absolute lifesaver', 'A long-term collaborator', 'Your go-to problem solver'];

export const YourHiresPage: React.FC = () => (
  <FreelancersLayout
    activeItem="Your hires"
    comingSoonDescription="Looking up everyone you've hired, and organizing them into lists, will be available here soon."
  >
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">Your hires</h1>
        <p className="text-xs text-ink-muted mt-1">Look up people you've worked with</p>
      </div>
      <button className="px-3.5 py-1.5 rounded-full border border-border text-xs font-semibold text-ink-muted whitespace-nowrap">
        Share list
      </button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
      {CARDS.map((label) => (
        <div
          key={label}
          className="bg-bg border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-3 h-56"
        >
          <div className="w-14 h-14 rounded-full bg-white border border-border flex items-center justify-center">
            <User className="w-7 h-7 text-ink-muted" />
          </div>
          <span className="text-xs font-semibold text-ink text-center">{label}</span>
        </div>
      ))}
    </div>

    <div className="text-center space-y-4">
      <p className="text-xs text-ink-muted">
        You haven't hired anyone yet. Start searching for the right fit for your next project.
      </p>
      <Button variant="outline" icon={Search}>
        Find Talent
      </Button>
    </div>
  </FreelancersLayout>
);
