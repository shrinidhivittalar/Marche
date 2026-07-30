import React from 'react';
import { Search, User } from 'lucide-react';
import { Button } from '@marche/ui';
import { FreelancersLayout } from './FreelancersLayout';

const CARDS = ['Your next superstar', 'Someone to bring your vision to life', 'A strategic thinker'];

export const SavedTalentPage: React.FC = () => (
  <FreelancersLayout
    activeItem="Discover"
    comingSoonDescription="Saving talent into lists so you can find them again later will be available here soon."
  >
    <div className="mb-6">
      <h1 className="text-2xl font-extrabold text-ink tracking-tight">Saved talent</h1>
      <p className="text-xs text-ink-muted mt-1">Look up people you've saved</p>
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
        You haven't saved anyone yet. Start saving to help you remember talent that caught your eye.
      </p>
      <Button variant="outline" icon={Search}>
        Find Talent
      </Button>
    </div>
  </FreelancersLayout>
);
