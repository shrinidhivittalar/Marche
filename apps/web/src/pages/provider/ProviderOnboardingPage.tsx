import React, { useState } from 'react';
import {
  Search,
  TrendingUp,
  Award,
  Wallet,
  IndianRupee,
  Medal,
  FileText,
  Package,
  Link2,
  Upload,
  PenLine,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  Button,
  Checkbox,
  Combobox,
  DatePicker,
  Input,
  LANGUAGES,
  MonthPicker,
  PhoneInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@marche/ui';
import { EventCategory, EnglishLevel } from '../../types';
import { todayISODate } from '../../lib/formatTime';
import { ApiError } from '../../lib/api';
import { profilesApi } from '../../lib/marketplace-api';

type Step =
  | 'welcome'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'profile'
  | 'category'
  | 'skills'
  | 'title'
  | 'experience'
  | 'education'
  | 'languages'
  | 'bio'
  | 'rate'
  | 'personal';

const STEP_META: Partial<Record<Step, { step: number; total: number }>> = {
  q1: { step: 1, total: 3 },
  q2: { step: 2, total: 3 },
  q3: { step: 3, total: 3 },
  profile: { step: 1, total: 10 },
  category: { step: 2, total: 10 },
  skills: { step: 3, total: 10 },
  title: { step: 4, total: 10 },
  experience: { step: 5, total: 10 },
  education: { step: 6, total: 10 },
  languages: { step: 7, total: 10 },
  bio: { step: 8, total: 10 },
  rate: { step: 9, total: 10 },
  personal: { step: 10, total: 10 },
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
    icon: FileText,
    label: "I'd like to find opportunities myself",
    desc: 'Clients post jobs on our marketplace — browse and bid, or get invited.',
  },
  {
    icon: Package,
    label: "I'd like to package up my work for clients to buy",
    desc: "Define your service with prices and timelines — we'll list it for clients to buy right away.",
  },
];

const CATEGORIES: EventCategory[] = [
  'Photography',
  'Catering',
  'DJ & Sound',
  'Floral & Decor',
  'Venue',
  'Event Planning',
  'Lighting & FX',
  'Entertainment',
];

const SKILL_SUGGESTIONS: Record<string, string[]> = {
  Photography: ['Event Photography', 'Photo Editing', 'Lightroom'],
  Catering: ['Menu Design', 'Event Catering', 'Wine Pairing'],
  'DJ & Sound': ['Live Mixing', 'Sound Engineering', 'MC Hosting'],
  'Floral & Decor': ['Floral Design', 'Event Styling', 'Installation'],
  Venue: ['Venue Management', 'AV Setup', 'Capacity Planning'],
  'Event Planning': ['Event Coordination', 'Vendor Management', 'Budgeting'],
  'Lighting & FX': ['Lighting Design', 'Haze FX', 'Rigging'],
  Entertainment: ['Live Performance', 'MC Hosting', 'Show Production'],
};

const TITLE_EXAMPLES: Record<string, string[]> = {
  Photography: [
    'Editorial Event Photographer | 8+ Years Experience',
    'Wedding & Corporate Event Photographer',
  ],
  Catering: [
    'Boutique Event Caterer | Farm-to-Table Menus',
    'Full-Service Catering for Weddings & Galas',
  ],
  'DJ & Sound': ['Wedding & Corporate Event DJ', 'Live Sound Engineer for Events & Concerts'],
  'Floral & Decor': ['Luxury Event Florist & Stylist', 'Floral Designer for Weddings & Galas'],
  Venue: ['Event Venue Manager & Coordinator', 'Venue Sourcing & Logistics Specialist'],
  'Event Planning': [
    'Full-Service Event Planner & Coordinator',
    'Corporate Event Planning Specialist',
  ],
  'Lighting & FX': ['Event Lighting Designer & Technician', 'Stage Lighting & FX Specialist'],
  Entertainment: ['Live Entertainment & MC Hosting', 'Event Performer & Show Producer'],
};

const PROFICIENCY_LEVELS: EnglishLevel[] = [
  'Basic',
  'Conversational',
  'Fluent',
  'Native or bilingual',
];
const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({ value: l, label: l }));

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

// `key` is a locally-generated id for stable React list keys — stripped before saving,
// since it isn't part of the actual User profile shape.
interface ExperienceEntry {
  key: string;
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
}
interface EducationEntry {
  key: string;
  school: string;
  degree?: string;
}
interface LanguageEntry {
  key: string;
  language: string;
  proficiency: EnglishLevel;
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
  const [step, setStep] = useState<Step>('welcome');
  const [q1, setQ1] = useState<string | null>(null);
  const [q2, setQ2] = useState<string | null>(null);
  const [q3, setQ3] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Profile-builder state
  const [categories, setCategories] = useState<EventCategory[]>(currentUser.categories ?? []);
  const [skills, setSkills] = useState<string[]>(currentUser.skills ?? []);
  const [skillInput, setSkillInput] = useState('');
  const [title, setTitle] = useState(currentUser.companyOrTitle ?? '');
  const [experience, setExperience] = useState<ExperienceEntry[]>(() =>
    (currentUser.workExperience ?? []).map((e) => ({ ...e, key: crypto.randomUUID() })),
  );
  const [expTitle, setExpTitle] = useState('');
  const [expCompany, setExpCompany] = useState('');
  const [expLocation, setExpLocation] = useState('');
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [expCurrent, setExpCurrent] = useState(false);
  const [education, setEducation] = useState<EducationEntry[]>(() =>
    (currentUser.education ?? []).map((e) => ({ ...e, key: crypto.randomUUID() })),
  );
  const [eduSchool, setEduSchool] = useState('');
  const [eduDegree, setEduDegree] = useState('');
  const [languages, setLanguages] = useState<LanguageEntry[]>(() =>
    (currentUser.languages ?? []).map((l) => ({ ...l, key: crypto.randomUUID() })),
  );
  const [langName, setLangName] = useState('');
  const [langProf, setLangProf] = useState<EnglishLevel>('Basic');
  const [bio, setBio] = useState(currentUser.bio ?? '');
  const [hourlyRate, setHourlyRate] = useState<number>(currentUser.hourlyRate ?? 0);
  const [phone, setPhone] = useState(currentUser.phone ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(currentUser.dateOfBirth ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const toggleCategory = (c: EventCategory) => {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((existing) => existing !== c) : [...prev, c],
    );
  };

  const addSkill = (raw: string) => {
    const s = raw.trim();
    if (!s || skills.includes(s) || skills.length >= 15) return;
    setSkills([...skills, s]);
    setSkillInput('');
  };

  const addExperience = () => {
    if (!expTitle.trim() || !expCompany.trim()) return;
    setExperience([
      ...experience,
      {
        key: crypto.randomUUID(),
        title: expTitle,
        company: expCompany,
        location: expLocation || undefined,
        startDate: expStart || undefined,
        endDate: expCurrent ? undefined : expEnd || undefined,
        current: expCurrent,
      },
    ]);
    setExpTitle('');
    setExpCompany('');
    setExpLocation('');
    setExpStart('');
    setExpEnd('');
    setExpCurrent(false);
  };

  const addEducation = () => {
    if (!eduSchool.trim()) return;
    setEducation([
      ...education,
      { key: crypto.randomUUID(), school: eduSchool, degree: eduDegree || undefined },
    ]);
    setEduSchool('');
    setEduDegree('');
  };

  const addLanguage = () => {
    if (!langName.trim()) return;
    setLanguages([
      ...languages,
      { key: crypto.randomUUID(), language: langName, proficiency: langProf },
    ]);
    setLangName('');
  };

  const handleFinish = async () => {
    // Title and bio are the two fields this wizard collects that also live on
    // /profiles/me and that the dashboard's completeness check reads, so they
    // go to the real API. Everything else this wizard collects — categories,
    // free-text skills, work history, education, languages, rate, phone, date
    // of birth — either has no column on the profile or has its own endpoint
    // per row; those stay on the local demo user, editable in profile
    // settings, rather than firing a dozen writes that can half-succeed
    // behind one button.
    setSaveError(null);
    setSaving(true);
    try {
      if (accessToken) {
        await profilesApi.updateMe(accessToken, {
          headline: title.trim() || null,
          bio: bio.trim() || null,
        });
      }
      updateCurrentUser({
        categories,
        skills,
        companyOrTitle: title,
        workExperience: experience.map(({ key: _key, ...e }) => e),
        education: education.map(({ key: _key, ...e }) => e),
        languages: languages.map(({ key: _key, ...l }) => l),
        bio,
        hourlyRate,
        phone,
        dateOfBirth,
      });
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
                onClick={() => setStep('category')}
              >
                Fill out manually
              </Button>
            </div>
          </div>
        )}

        {step === 'category' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-ink tracking-tight">
                Great, what kind of service do you offer?
              </h2>
              <p className="text-xs text-ink-muted mt-2">
                Select as many as you like — you can always change this later.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCategory(c)}
                  className={`p-3 rounded-xl border text-xs font-medium text-left cursor-pointer transition-all ${
                    categories.includes(c)
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : 'border-border bg-white text-ink-muted hover:border-zinc-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <StepFooter
              onBack={() => setStep('profile')}
              onSkip={() => setStep('skills')}
              onNext={() => setStep('skills')}
              nextLabel="Next, add your skills"
              nextDisabled={categories.length === 0}
            />
          </div>
        )}

        {step === 'skills' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-ink tracking-tight">
                What skills define your work?
              </h2>
              <p className="text-xs text-ink-muted mt-2">
                Your skills show clients what you can offer. Add up to 15.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 p-2 border border-border rounded-xl bg-white">
              {skills.map((s) => (
                <span
                  key={s}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-subtle text-xs font-medium text-ink"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => setSkills(skills.filter((x) => x !== s))}
                    className="cursor-pointer text-ink-muted hover:text-rose-600"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSkill(skillInput);
                  }
                }}
                placeholder="Enter skills here"
                // Bare on purpose: this sits inside the chip row's own bordered
                // box, so a bordered Input here would draw a box inside a box.
                className="flex-1 min-w-[140px] bg-transparent text-xs text-ink placeholder:text-ink-muted outline-none px-1 py-1"
              />
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(categories.flatMap((c) => SKILL_SUGGESTIONS[c] ?? [])))
                  .filter((s) => !skills.includes(s))
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addSkill(s)}
                      className="px-3 py-1.5 rounded-full border border-border text-xs font-medium text-ink hover:border-primary cursor-pointer"
                    >
                      + {s}
                    </button>
                  ))}
              </div>
            )}
            <StepFooter
              onBack={() => setStep('category')}
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

              {categories.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-ink">Example titles</p>
                  <ul className="space-y-1.5">
                    {Array.from(new Set(categories.flatMap((c) => TITLE_EXAMPLES[c] ?? []))).map(
                      (example) => (
                        <li key={example}>
                          <button
                            type="button"
                            onClick={() => setTitle(example)}
                            className="text-left text-xs text-ink-muted hover:text-primary transition-colors cursor-pointer leading-relaxed"
                          >
                            {example}
                          </button>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
            </div>
            <StepFooter
              onBack={() => setStep('skills')}
              onSkip={() => setStep('experience')}
              onNext={() => setStep('experience')}
              nextLabel="Next, add your experience"
            />
          </div>
        )}

        {step === 'experience' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-extrabold text-ink tracking-tight">
              Tell us about your work experience.
            </h2>
            <div className="space-y-2">
              {experience.map((exp) => (
                <div
                  key={exp.key}
                  className="flex items-center justify-between p-3 border border-border rounded-xl bg-white text-xs"
                >
                  <div>
                    <span className="font-semibold text-ink">{exp.title}</span>
                    <span className="text-ink-muted">
                      {' '}
                      · {exp.company}
                      {exp.location ? ` · ${exp.location}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExperience(experience.filter((e) => e.key !== exp.key))}
                    className="text-zinc-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="p-4 border border-border rounded-xl bg-bg space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="Job title"
                />
                <Input
                  value={expCompany}
                  onChange={(e) => setExpCompany(e.target.value)}
                  placeholder="Company"
                />
                <Input
                  value={expLocation}
                  onChange={(e) => setExpLocation(e.target.value)}
                  placeholder="Location (optional)"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MonthPicker
                  value={expStart}
                  onChange={setExpStart}
                  max={todayISODate().slice(0, 7)}
                />
                <span className="text-xs text-ink-muted">to</span>
                <MonthPicker
                  value={expEnd}
                  onChange={setExpEnd}
                  min={expStart}
                  max={todayISODate().slice(0, 7)}
                  disabled={expCurrent}
                />
                <label className="flex items-center gap-1.5 text-xs text-ink cursor-pointer ml-2">
                  <Checkbox
                    checked={expCurrent}
                    onCheckedChange={(checked) => setExpCurrent(checked === true)}
                  />{' '}
                  Currently working here
                </label>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addExperience}>
                Add experience
              </Button>
            </div>
            <StepFooter
              onBack={() => setStep('title')}
              onSkip={() => setStep('education')}
              onNext={() => setStep('education')}
              nextLabel="Next, add your education"
            />
          </div>
        )}

        {step === 'education' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-extrabold text-ink tracking-tight">And your education?</h2>
            <div className="space-y-2">
              {education.map((edu) => (
                <div
                  key={edu.key}
                  className="flex items-center justify-between p-3 border border-border rounded-xl bg-white text-xs"
                >
                  <div>
                    <span className="font-semibold text-ink">{edu.school}</span>
                    {edu.degree && <span className="text-ink-muted"> · {edu.degree}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEducation(education.filter((e) => e.key !== edu.key))}
                    className="text-zinc-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="p-4 border border-border rounded-xl bg-bg space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  value={eduSchool}
                  onChange={(e) => setEduSchool(e.target.value)}
                  placeholder="School"
                />
                <Input
                  value={eduDegree}
                  onChange={(e) => setEduDegree(e.target.value)}
                  placeholder="Degree (optional)"
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addEducation}>
                Add education
              </Button>
            </div>
            <StepFooter
              onBack={() => setStep('experience')}
              onSkip={() => setStep('languages')}
              onNext={() => setStep('languages')}
              nextLabel="Next, add languages"
            />
          </div>
        )}

        {step === 'languages' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-extrabold text-ink tracking-tight">
              Which languages do you speak?
            </h2>
            <p className="text-xs text-ink-muted">English is a must — do you speak any others?</p>
            <div className="space-y-2">
              {languages.map((l) => (
                <div
                  key={l.key}
                  className="flex items-center justify-between p-3 border border-border rounded-xl bg-white text-xs"
                >
                  <span className="font-semibold text-ink">
                    {l.language}{' '}
                    <span className="text-ink-muted font-normal">— {l.proficiency}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setLanguages(languages.filter((lang) => lang.key !== l.key))}
                    className="text-zinc-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Combobox
                options={LANGUAGE_OPTIONS}
                value={langName}
                onChange={setLangName}
                placeholder="Select a language"
                searchPlaceholder="Search languages..."
                className="max-w-[220px]"
              />
              <Select value={langProf} onValueChange={(v) => setLangProf(v as EnglishLevel)}>
                <SelectTrigger className="max-w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFICIENCY_LEVELS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={addLanguage}>
                Add language
              </Button>
            </div>
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
            <StepFooter
              onBack={() => setStep('languages')}
              onSkip={() => setStep('rate')}
              onNext={() => setStep('rate')}
              nextLabel="Next, set your rate"
            />
          </div>
        )}

        {step === 'rate' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-ink tracking-tight">
                Now, let's set your hourly rate.
              </h2>
              <p className="text-xs text-ink-muted mt-2">
                Clients will see this rate on your profile. You can adjust it any time.
              </p>
            </div>
            {/* The service-fee and "you'll get" rows are gone with the invented
                10% commission behind them. Marché has never charged one — there
                is no payments module — and the rest of the app says so
                ("0% vendor commission"). SubmitProposalPage dropped the same
                breakdown for the same reason. What is left is the rate itself,
                which is the only number this step was ever entitled to state. */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-semibold text-ink">Hourly rate</p>
                  <p className="text-xs text-ink-muted">Total amount the client will see.</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-ink-muted">₹</span>
                  <Input
                    type="number"
                    min={0}
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Math.max(0, Number(e.target.value)))}
                    aria-label="Rate per hour"
                    className="w-24 h-auto py-1.5 text-right text-sm"
                  />
                  <span className="text-xs text-ink-muted">/hr</span>
                </div>
              </div>
            </div>
            <StepFooter
              onBack={() => setStep('bio')}
              onSkip={() => setStep('personal')}
              onNext={() => setStep('personal')}
              nextLabel="Next, last details"
            />
          </div>
        )}

        {step === 'personal' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-ink tracking-tight">
                A few last details.
              </h2>
              <p className="text-xs text-ink-muted mt-2">
                We need this to keep payments safe and simple.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Date of birth</label>
                <DatePicker
                  value={dateOfBirth}
                  onChange={setDateOfBirth}
                  max={todayISODate()}
                  captionLayout="dropdown"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Phone</label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
            </div>
            {saveError && (
              <p role="alert" data-testid="onboarding-error" className="text-sm text-danger">
                {saveError}
              </p>
            )}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => setStep('rate')}>
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
