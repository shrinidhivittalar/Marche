import React, { useState } from 'react';
import {
  Search,
  TrendingUp,
  Award,
  Wallet,
  IndianRupee,
  Medal,
  Link2,
  Upload,
  PenLine,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Checkbox, Input, Textarea } from '@marche/ui';
import { ApiError } from '../../lib/api';
import { profilesApi, type ApiProfile } from '../../lib/marketplace-api';
import { useApiResource } from '../../hooks/useApiResource';
import {
  SkillsCard,
  ExperienceCard,
  EducationCard,
  LanguagesCard,
} from '../../components/profile/ProfileCards';

// Every step here writes through the same real endpoints Profile Settings
// uses (ProfileCards.tsx, shared with ProfileApiSection) — skills,
// experience, education and languages save the moment "Add" is clicked,
// not batched behind the final button. That removes the "fires a dozen
// writes that can half-succeed behind one button" risk a previous version
// of this file cited for why those fields stayed local-only: there is no
// longer one big write, each entry is already saved by the time Finish is
// clicked.
//
// Three things this wizard used to collect were deleted rather than wired:
// categories, hourly rate, phone, and date of birth. None has a Profile
// column or an endpoint, and nothing downstream reads any of them — a
// provider already picks a category for real when creating a service
// (MyServicesPage), which is where that choice actually belongs.

type Step =
  | 'welcome'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'profile'
  | 'skills'
  | 'title'
  | 'experience'
  | 'education'
  | 'languages'
  | 'bio';

const STEP_META: Partial<Record<Step, { step: number; total: number }>> = {
  q1: { step: 1, total: 3 },
  q2: { step: 2, total: 3 },
  q3: { step: 3, total: 3 },
  profile: { step: 1, total: 7 },
  skills: { step: 2, total: 7 },
  title: { step: 3, total: 7 },
  experience: { step: 4, total: 7 },
  education: { step: 5, total: 7 },
  languages: { step: 6, total: 7 },
  bio: { step: 7, total: 7 },
};

const Q1_OPTIONS = [
  { icon: Search, label: 'I am brand new to this' },
  { icon: TrendingUp, label: 'I have some experience' },
  { icon: Award, label: 'I am an expert' },
];

const Q2_OPTIONS = [
  { icon: Wallet, label: 'To earn my main income' },
  { icon: IndianRupee, label: 'To make money on the side' },
  { icon: Medal, label: 'To get experience, for a full-time job' },
  { icon: Search, label: "I don't have a goal in mind yet" },
];

const Q3_OPTIONS = [
  {
    icon: PenLine,
    label: "I'd like to find opportunities myself",
    desc: 'Clients post jobs on our marketplace — browse and bid, or get invited.',
  },
  {
    icon: Upload,
    label: "I'd like to package up my work for clients to buy",
    desc: "Define your service with prices and timelines — we'll list it for clients to buy right away.",
  },
];

// Maps each question's UI label to the profile enum value it saves as.
// Keyed off the option label rather than an index, so reordering the
// option arrays above can't silently change what a stored answer means.
const EXPERIENCE_LEVEL_BY_LABEL: Record<string, 'NEW' | 'SOME_EXPERIENCE' | 'EXPERT'> = {
  'I am brand new to this': 'NEW',
  'I have some experience': 'SOME_EXPERIENCE',
  'I am an expert': 'EXPERT',
};

const GOAL_BY_LABEL: Record<string, 'MAIN_INCOME' | 'SIDE_INCOME' | 'EXPERIENCE' | 'UNDECIDED'> = {
  'To earn my main income': 'MAIN_INCOME',
  'To make money on the side': 'SIDE_INCOME',
  'To get experience, for a full-time job': 'EXPERIENCE',
  "I don't have a goal in mind yet": 'UNDECIDED',
};

const WORK_PREFERENCE_BY_LABEL: Record<
  string,
  'FIND_OPPORTUNITIES' | 'PACKAGE_SERVICES' | 'CONTRACT_TO_HIRE'
> = {
  "I'd like to find opportunities myself": 'FIND_OPPORTUNITIES',
  "I'd like to package up my work for clients to buy": 'PACKAGE_SERVICES',
  'contract-to-hire': 'CONTRACT_TO_HIRE',
};

function Stepper({ step, total }: { step: number; total: number }) {
  return (
    <div className="space-y-2 w-full">
      <span className="text-xs text-ink-muted font-mono">
        {step}/{total}
      </span>
      <div className="h-1 w-full bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

function OptionCard({
  icon: Icon,
  label,
  desc,
  selected,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  desc?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
        selected
          ? 'border-primary bg-primary/10 ring-1 ring-primary'
          : 'border-border bg-white hover:border-zinc-300'
      }`}
    >
      <Icon className={`w-6 h-6 mb-3 ${selected ? 'text-primary' : 'text-ink-muted'}`} />
      <p className="text-sm font-semibold text-ink">{label}</p>
      {desc && <p className="text-xs text-ink-muted mt-1 leading-relaxed">{desc}</p>}
    </button>
  );
}

function StepFooter({
  onBack,
  onSkip,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onBack: () => void;
  onSkip: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <Button variant="outline" onClick={onBack}>
        Back
      </Button>
      <div className="flex items-center gap-4">
        <button
          className="text-xs font-semibold text-ink-muted hover:text-ink cursor-pointer"
          onClick={onSkip}
        >
          Skip for now
        </button>
        <Button onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg tracking-tight shadow-xs shrink-0">
        M
      </div>
      <span className="text-lg font-extrabold tracking-tight text-ink">MARCHÉ</span>
    </div>
  );
}

export const ProviderOnboardingPage: React.FC = () => {
  const { currentUser, updateCurrentUser, navigate, accessToken } = useApp();
  const token = accessToken as string;
  const [step, setStep] = useState<Step>('welcome');
  const [q1, setQ1] = useState<string | null>(null);
  const [q2, setQ2] = useState<string | null>(null);
  const [q3, setQ3] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // The real profile — created for every user at registration, so this is
  // never null once accessToken exists. Skills/Experience/Education/
  // Languages read and write straight through this rather than a local
  // mirror; refetched after every add/remove so each card shows what the
  // server actually holds.
  const profile = useApiResource<ApiProfile>(() => profilesApi.me(token), [token], {
    enabled: Boolean(token),
  });
  const skillsList = useApiResource(() => profilesApi.listSkills(token), [token], {
    enabled: Boolean(token),
  });
  const usedSkillIds = new Set((profile.data?.skills ?? []).map((s) => s.skill.id));
  const availableSkills = (skillsList.data?.items ?? []).filter((s) => !usedSkillIds.has(s.id));

  const [title, setTitle] = useState(currentUser.companyOrTitle ?? '');
  const [bio, setBio] = useState(currentUser.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleQ3 = (label: string) => {
    setQ3((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Every card below follows the same shape: do the write, then refetch so
  // the list reflects what the server actually has, surfacing an error
  // inline rather than letting it vanish.
  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
      await profile.refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  };

  const handleFinish = async () => {
    // Only headline/bio/Q1/Q2/Q3 are written here — skills, experience,
    // education and languages already saved themselves as each was added.
    setSaveError(null);
    setSaving(true);
    try {
      await profilesApi.updateMe(token, {
        headline: title.trim() || null,
        bio: bio.trim() || null,
        experienceLevel: q1 ? EXPERIENCE_LEVEL_BY_LABEL[q1] : undefined,
        primaryGoal: q2 ? GOAL_BY_LABEL[q2] : undefined,
        workPreferences: q3.size
          ? [...q3]
              .map((label) => WORK_PREFERENCE_BY_LABEL[label])
              .filter((v): v is NonNullable<typeof v> => v !== undefined)
          : undefined,
      });
      updateCurrentUser({ companyOrTitle: title, bio });
      navigate('/provider/dashboard');
    } catch (err) {
      // Stay put and say so. Landing on a dashboard that still reads
      // "your profile is incomplete" gives the user no idea what went wrong.
      setSaveError(
        err instanceof ApiError
          ? err.message
          : 'We could not save your profile. Please check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const stepMeta = STEP_META[step];
  const p = profile.data;

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-6 sm:px-10 py-6">
        <BrandHeader />
      </div>

      {stepMeta && (
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur-sm border-b border-border">
          <div className="max-w-2xl mx-auto px-6 py-4">
            <Stepper step={stepMeta.step} total={stepMeta.total} />
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-8 px-6 py-10 pb-16">
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl text-xs font-medium">
            {toast}
          </div>
        )}

        {step === 'welcome' && (
          <div className="space-y-8">
            <h1 className="text-3xl md:text-4xl font-extrabold text-ink tracking-tight leading-snug">
              Hey {currentUser.name.split(' ')[0]}. Ready for your next big opportunity?
            </h1>
            <div className="divide-y divide-border border-t border-b border-border">
              {[
                'Answer a few questions and start building your profile',
                'Apply for open jobs or list services for clients to buy',
                "Get paid safely and know we're there to help",
              ].map((line) => (
                <p key={line} className="py-4 text-sm text-ink">
                  {line}
                </p>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button size="lg" onClick={() => setStep('q1')}>
                Get started
              </Button>
              <span className="text-xs text-ink-muted">
                It only takes 2 minutes. You can edit it later.
              </span>
            </div>
          </div>
        )}

        {step === 'q1' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-ink tracking-tight">
                A few quick questions: have you done this kind of work before?
              </h2>
              <p className="text-xs text-ink-muted mt-2">
                This helps us know how much guidance to give you. We won't share your answer with
                clients.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Q1_OPTIONS.map((o) => (
                <OptionCard
                  key={o.label}
                  icon={o.icon}
                  label={o.label}
                  selected={q1 === o.label}
                  onClick={() => setQ1(o.label)}
                />
              ))}
            </div>
            <StepFooter
              onBack={() => setStep('welcome')}
              onSkip={() => setStep('q2')}
              onNext={() => setStep('q2')}
              nextLabel="Next"
              nextDisabled={!q1}
            />
          </div>
        )}

        {step === 'q2' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-ink tracking-tight">
                Got it. What's your biggest goal?
              </h2>
              <p className="text-xs text-ink-muted mt-2">
                We'll highlight the opportunities that fit your goal best, while still showing you
                everything.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Q2_OPTIONS.map((o) => (
                <OptionCard
                  key={o.label}
                  icon={o.icon}
                  label={o.label}
                  selected={q2 === o.label}
                  onClick={() => setQ2(o.label)}
                />
              ))}
            </div>
            <StepFooter
              onBack={() => setStep('q1')}
              onSkip={() => setStep('q3')}
              onNext={() => setStep('q3')}
              nextLabel="Next"
              nextDisabled={!q2}
            />
          </div>
        )}

        {step === 'q3' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-ink tracking-tight">
                And how would you like to work?
              </h2>
              <p className="text-xs text-ink-muted mt-2">
                Select as many as you like — you can always change this later.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Q3_OPTIONS.map((o) => (
                <OptionCard
                  key={o.label}
                  icon={o.icon}
                  label={o.label}
                  desc={o.desc}
                  selected={q3.has(o.label)}
                  onClick={() => toggleQ3(o.label)}
                />
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
              <Checkbox
                checked={q3.has('contract-to-hire')}
                onCheckedChange={() => toggleQ3('contract-to-hire')}
              />
              I'm open to contract-to-hire opportunities
            </label>
            <StepFooter
              onBack={() => setStep('q2')}
              onSkip={() => setStep('profile')}
              onNext={() => setStep('profile')}
              nextLabel="Next, create a profile"
              nextDisabled={q3.size === 0}
            />
          </div>
        )}

        {step === 'profile' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-extrabold text-ink tracking-tight">
              How would you like to tell us about yourself?
            </h2>
            <p className="text-xs text-ink-muted">
              We need a sense of your experience and skills. You can edit everything before your
              profile goes live.
            </p>
            <div className="space-y-3 max-w-sm">
              <Button
                variant="outline"
                className="w-full justify-start"
                icon={Link2}
                onClick={() =>
                  showToast(
                    "LinkedIn import isn't wired up yet — Marché is still a frontend preview.",
                  )
                }
              >
                Import from LinkedIn
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                icon={Upload}
                onClick={() =>
                  showToast(
                    "Resume upload isn't wired up yet — Marché is still a frontend preview.",
                  )
                }
              >
                Upload your resume
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                icon={PenLine}
                onClick={() => setStep('skills')}
              >
                Fill out manually
              </Button>
            </div>
          </div>
        )}

        {step === 'skills' && p && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-ink tracking-tight">
                What skills define your work?
              </h2>
              <p className="text-xs text-ink-muted mt-2">
                Your skills show clients what you can offer.
              </p>
            </div>
            {actionError && <p className="text-sm text-danger">{actionError}</p>}
            <SkillsCard
              profile={p}
              availableSkills={availableSkills}
              disabled={profile.loading}
              onAdd={(skillId) => void runAction(() => profilesApi.addSkill(token, skillId))}
              onAddNamed={(name) => void runAction(() => profilesApi.addSkillByName(token, name))}
              onRemove={(userSkillId) =>
                void runAction(() => profilesApi.removeSkill(token, userSkillId))
              }
            />
            <StepFooter
              onBack={() => setStep('profile')}
              onSkip={() => setStep('title')}
              onNext={() => setStep('title')}
              nextLabel="Next, your title"
            />
          </div>
        )}

        {step === 'title' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-ink tracking-tight">
                Now, add a title to tell the world what you do.
              </h2>
              <p className="text-xs text-ink-muted mt-2">
                It's the first thing clients see, so make it count.
              </p>
            </div>
            <div className="max-w-lg">
              <label className="block text-xs font-semibold text-ink mb-1">
                Your professional title
              </label>
              <p className="text-[11px] text-ink-muted mb-2">
                A one-line headline, not a job title — this is what clients see on your listing,
                before your full profile.
              </p>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Editorial Event Photographer | 8+ Years Experience"
              />
            </div>
            <StepFooter
              onBack={() => setStep('skills')}
              onSkip={() => setStep('experience')}
              onNext={() => setStep('experience')}
              nextLabel="Next, add your experience"
            />
          </div>
        )}

        {step === 'experience' && p && (
          <div className="space-y-6">
            <h2 className="text-2xl font-extrabold text-ink tracking-tight">
              Tell us about your work experience.
            </h2>
            {actionError && <p className="text-sm text-danger">{actionError}</p>}
            <ExperienceCard
              profile={p}
              disabled={profile.loading}
              onAdd={(body) => void runAction(() => profilesApi.addExperience(token, body))}
              onRemove={(id) => void runAction(() => profilesApi.removeExperience(token, id))}
            />
            <StepFooter
              onBack={() => setStep('title')}
              onSkip={() => setStep('education')}
              onNext={() => setStep('education')}
              nextLabel="Next, add your education"
            />
          </div>
        )}

        {step === 'education' && p && (
          <div className="space-y-6">
            <h2 className="text-2xl font-extrabold text-ink tracking-tight">And your education?</h2>
            {actionError && <p className="text-sm text-danger">{actionError}</p>}
            <EducationCard
              profile={p}
              disabled={profile.loading}
              onAdd={(body) => void runAction(() => profilesApi.addEducation(token, body))}
              onRemove={(id) => void runAction(() => profilesApi.removeEducation(token, id))}
            />
            <StepFooter
              onBack={() => setStep('experience')}
              onSkip={() => setStep('languages')}
              onNext={() => setStep('languages')}
              nextLabel="Next, add languages"
            />
          </div>
        )}

        {step === 'languages' && p && (
          <div className="space-y-6">
            <h2 className="text-2xl font-extrabold text-ink tracking-tight">
              Which languages do you speak?
            </h2>
            <p className="text-xs text-ink-muted">English is a must — do you speak any others?</p>
            {actionError && <p className="text-sm text-danger">{actionError}</p>}
            <LanguagesCard
              profile={p}
              disabled={profile.loading}
              onAdd={(body) => void runAction(() => profilesApi.addLanguage(token, body))}
              onRemove={(id) => void runAction(() => profilesApi.removeLanguage(token, id))}
            />
            <StepFooter
              onBack={() => setStep('education')}
              onSkip={() => setStep('bio')}
              onNext={() => setStep('bio')}
              nextLabel="Next, write an overview"
            />
          </div>
        )}

        {step === 'bio' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-ink tracking-tight">
                Now write a bio to tell the world about yourself.
              </h2>
              <p className="text-xs text-ink-muted mt-2">
                What work do you do best? Tell clients clearly.
              </p>
            </div>
            <Textarea
              rows={8}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Describe your experience, specialties, and what makes you stand out..."
              className="max-w-2xl"
            />
            {saveError && (
              <p role="alert" data-testid="onboarding-error" className="text-sm text-danger">
                {saveError}
              </p>
            )}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => setStep('languages')}>
                Back
              </Button>
              <Button onClick={() => void handleFinish()} disabled={saving}>
                {saving ? 'Saving…' : 'Save & finish'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
