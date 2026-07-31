import React, { useState } from 'react';
import { Wand2, ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '@marche/ui';

const MAX_PROMPT_LENGTH = 1500;

const PHASES = ['Add business context', 'Create job post', 'Share with talent'];

type IntroView = 'welcome' | 'prompt';

function PhaseStepper() {
  return (
    <div className="flex items-center justify-center gap-3 sm:gap-6 py-2">
      {PHASES.map((label, idx) => {
        const state = idx === 0 ? 'done' : idx === 1 ? 'current' : 'upcoming';
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors ${
                  state === 'done'
                    ? 'bg-primary border-primary text-white'
                    : state === 'current'
                      ? 'border-primary text-primary'
                      : 'border-border text-ink-muted'
                }`}
              >
                {state === 'done' ? (
                  <span className="text-[10px]">✓</span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-current" />
                )}
              </div>
              <span
                className={`text-[11px] font-medium text-center max-w-[7rem] ${
                  state === 'upcoming' ? 'text-ink-muted' : 'text-ink'
                }`}
              >
                {label}
              </span>
            </div>
            {idx < PHASES.length - 1 && (
              <div className={`h-px flex-1 mt-[-1.25rem] ${idx === 0 ? 'bg-primary' : 'bg-border'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export const PostJobIntroPage: React.FC = () => {
  const { currentUser, navigate } = useApp();

  const [view, setView] = useState<IntroView>('welcome');
  const [prompt, setPrompt] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const firstName = currentUser.name.split(' ')[0];
  const charsLeft = MAX_PROMPT_LENGTH - prompt.length;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-4">
      {toastMessage && (
        <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
          <span>{toastMessage}</span>
        </div>
      )}

      <button
        onClick={() => (view === 'welcome' ? navigate('/client/dashboard') : setView('welcome'))}
        className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      <PhaseStepper />

      {view === 'welcome' && (
        <div className="flex flex-col items-center text-center gap-6 pt-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Wand2 className="w-7 h-7 text-primary" />
          </div>

          <div className="space-y-3 max-w-lg">
            <h1 className="text-3xl md:text-4xl font-extrabold text-ink tracking-tight leading-snug">
              Welcome, {firstName}! Let's start with your first job post.
            </h1>
            <p className="text-sm text-ink-muted leading-relaxed">
              It's the fastest way to meet top talent. Get help from AI and be done in no time.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 pt-2">
            <Button size="lg" icon={Wand2} onClick={() => setView('prompt')}>
              Get started using AI
            </Button>
            <button
              onClick={() => navigate('/client/jobs/new/manual')}
              className="text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              I'll do it without AI
            </button>
          </div>

          <p className="text-[11px] text-ink-muted pt-6">
            Beta feature powered by Marché AI ·{' '}
            <button
              onClick={() => showToast("This isn't wired up yet — Marché is still a frontend preview.")}
              className="underline hover:text-ink cursor-pointer"
            >
              How it works
            </button>
          </p>
        </div>
      )}

      {view === 'prompt' && (
        <div className="space-y-10 pt-6">
          <h1 className="text-2xl md:text-4xl font-extrabold text-ink tracking-tight leading-snug text-center max-w-2xl mx-auto">
            Describe what you're looking for in a sentence or two.
          </h1>

          <div>
            <textarea
              rows={1}
              maxLength={MAX_PROMPT_LENGTH}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g. I need someone to help me build a Shopify website for my office furniture business."
              className="w-full rounded-full border border-border bg-surface px-6 py-4 text-sm text-ink placeholder:text-ink-muted outline-none focus:border-primary transition-colors resize-none"
            />
            <p className="text-[11px] text-ink-muted text-right mt-2">
              {charsLeft.toLocaleString('en-IN')} characters left
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => setView('welcome')}>
              Back
            </Button>
            <Button
              disabled={prompt.trim().length === 0}
              onClick={() => showToast("AI-assisted job posting isn't wired up yet — Marché is still a frontend preview.")}
            >
              Continue
            </Button>
          </div>

          <div className="h-1 w-full bg-border rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: '66%' }} />
          </div>
        </div>
      )}
    </div>
  );
};
