import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  MapPin,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card, Input, Textarea } from '@marche/ui';
import { EventCategory, EventTimingMode } from '../../types';
import { formatEventSchedule } from '../../lib/formatTime';

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

const TITLE_EXAMPLES: Record<EventCategory, string[]> = {
  Photography: [
    'Lead Editorial Photographer for NYC Luxury Brand Launch',
    'Wedding Photographer for 200-Guest Rooftop Ceremony',
  ],
  Catering: [
    'Full-Service Catering for 150-Guest Rooftop Wedding',
    'Plated Dinner Service for Corporate Gala, 80 Covers',
  ],
  'DJ & Sound': [
    'High-Energy DJ & Sound Setup for Product Launch Party',
    'Wedding Reception DJ with MC Experience, 5-Hour Set',
  ],
  'Floral & Decor': [
    'Full Floral Design for Garden-Themed Wedding, 12 Tables',
    'Minimalist Stage & Backdrop Decor for Brand Activation',
  ],
  Venue: [
    'Loft Venue for 100-Guest Product Launch, Manhattan',
    'Outdoor Garden Venue for 150-Guest Summer Wedding',
  ],
  'Event Planning': [
    'Full-Service Planner for Two-Day Destination Wedding',
    'Day-Of Coordinator for 120-Guest Corporate Offsite',
  ],
  'Lighting & FX': [
    'Architectural Lighting Design for Rooftop Gala',
    'Dance Floor Lighting & Haze FX for Nightclub Launch',
  ],
  Entertainment: [
    'Live Jazz Trio for Cocktail Hour, 3-Hour Booking',
    'Interactive Photo Booth & Entertainment for Brand Event',
  ],
};

type WizardStep = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Category',
  2: 'Title',
  3: 'Description',
  4: 'Logistics',
  5: 'Budget & Review',
};

const PHASES: { label: string; steps: WizardStep[] }[] = [
  { label: 'Scope the job', steps: [1, 2, 3] },
  { label: 'Set logistics', steps: [4] },
  { label: 'Budget & publish', steps: [5] },
];

function todayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const CreateJobPage: React.FC = () => {
  const { createJob, navigate } = useApp();

  const [step, setStep] = useState<WizardStep>(1);
  const [attemptedNext, setAttemptedNext] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('Photography');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('Manhattan, New York, NY');
  const [eventDate, setEventDate] = useState('2026-09-25');
  const [timingMode, setTimingMode] = useState<EventTimingMode>('fixed');
  const [eventStartTime, setEventStartTime] = useState('18:00');
  const [eventEndTime, setEventEndTime] = useState('22:00');
  const [proposalDeadline, setProposalDeadline] = useState('2026-09-10');
  const [budgetMin, setBudgetMin] = useState<number>(2500);
  const [budgetMax, setBudgetMax] = useState<number>(4000);
  const [deliverables, setDeliverables] = useState<string[]>([
    'High-resolution edited digital assets within 48h',
    'On-site production crew & equipment included',
    'Full commercial licensing for social & press',
  ]);
  const [newDeliverableInput, setNewDeliverableInput] = useState('');

  const handleAddDeliverable = () => {
    if (newDeliverableInput.trim()) {
      setDeliverables([...deliverables, newDeliverableInput.trim()]);
      setNewDeliverableInput('');
    }
  };

  const handleRemoveDeliverable = (idx: number) => {
    setDeliverables(deliverables.filter((_, i) => i !== idx));
  };

  const isStepValid = (s: WizardStep): boolean => {
    switch (s) {
      case 1:
        return !!category;
      case 2:
        return title.trim().length > 0;
      case 3:
        return description.trim().length > 0;
      case 4:
        return (
          !!eventDate &&
          !!proposalDeadline &&
          (timingMode !== 'fixed' ||
            (!!eventStartTime && !!eventEndTime && eventEndTime > eventStartTime))
        );
      case 5:
        return budgetMax >= budgetMin;
    }
  };

  const goToStep = (s: WizardStep) => {
    setAttemptedNext(false);
    setStep(s);
  };

  const handleNext = () => {
    if (!isStepValid(step)) {
      setAttemptedNext(true);
      return;
    }
    if (step === 5) {
      handleSubmit();
      return;
    }
    goToStep((step + 1) as WizardStep);
  };

  const handleBack = () => {
    if (step === 1) {
      navigate('/client/dashboard');
      return;
    }
    goToStep((step - 1) as WizardStep);
  };

  const handleSubmit = () => {
    if (!isStepValid(5)) {
      setAttemptedNext(true);
      return;
    }

    const createdReq = createJob({
      title,
      category,
      description,
      location,
      eventDate,
      timingMode,
      eventStartTime: timingMode === 'fixed' ? eventStartTime : undefined,
      eventEndTime: timingMode === 'fixed' ? eventEndTime : undefined,
      proposalDeadline,
      budgetMin,
      budgetMax,
      deliverables,
    });

    navigate(`/client/jobs/${createdReq.id}`);
  };

  const currentPhaseIndex = PHASES.findIndex((p) => p.steps.includes(step));
  const showTitleError = attemptedNext && !isStepValid(2);
  const showDescriptionError = attemptedNext && !isStepValid(3);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-4">
      {/* Header Back Link */}
      <button
        onClick={() => navigate('/client/dashboard')}
        className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Client Dashboard</span>
      </button>

      {/* Phase Stepper */}
      <div className="flex items-center justify-center gap-3 sm:gap-6 py-2">
        {PHASES.map((phase, idx) => {
          const state = idx < currentPhaseIndex ? 'done' : idx === currentPhaseIndex ? 'current' : 'upcoming';
          return (
            <React.Fragment key={phase.label}>
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
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-current" />
                  )}
                </div>
                <span
                  className={`text-[11px] font-medium text-center max-w-[7rem] ${
                    state === 'upcoming' ? 'text-ink-muted' : 'text-ink'
                  }`}
                >
                  {phase.label}
                </span>
              </div>
              {idx < PHASES.length - 1 && (
                <div className={`h-px flex-1 mt-[-1.25rem] ${idx < currentPhaseIndex ? 'bg-primary' : 'bg-border'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="text-center">
        <span className="text-xs font-mono uppercase font-semibold text-ink-muted">
          {step}/5 · Event Job
        </span>
      </div>

      {/* Step 1: Category */}
      {step === 1 && (
        <Card padding="lg">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight leading-snug">
                What kind of service do you need?
              </h2>
              <p className="text-sm text-ink-muted mt-3 leading-relaxed max-w-sm">
                Pick the category that best fits your event. This routes your job to the right
                verified talent and shapes the questions we ask next.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`p-3.5 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                    category === cat
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                      : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Step 2: Title */}
      {step === 2 && (
        <Card padding="lg">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight leading-snug">
                Let's start with a strong title.
              </h2>
              <p className="text-sm text-ink-muted mt-3 leading-relaxed max-w-sm">
                This is the first thing talent sees, so make it count. Be specific about the role and the
                occasion.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Write a title for your job
              </label>
              <Input
                type="text"
                placeholder="e.g. Lead Editorial Photographer for NYC Luxury Brand Launch"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-invalid={showTitleError}
              />
              {showTitleError && (
                <p className="text-[11px] text-destructive mt-1.5 font-medium">Title is required</p>
              )}

              <div className="mt-6 space-y-2">
                <p className="text-xs font-semibold text-ink">Example titles</p>
                <ul className="space-y-1.5">
                  {(TITLE_EXAMPLES[category] ?? []).map((example) => (
                    <li key={example}>
                      <button
                        type="button"
                        onClick={() => setTitle(example)}
                        className="text-left text-xs text-ink-muted hover:text-primary transition-colors cursor-pointer leading-relaxed"
                      >
                        {example}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Description */}
      {step === 3 && (
        <Card padding="lg">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight leading-snug">
                Describe the scope in detail.
              </h2>
              <p className="text-sm text-ink-muted mt-3 leading-relaxed max-w-sm">
                Cover the atmosphere, guest count, and any technical or equipment expectations. The more
                context you give, the more accurate the proposals you'll receive.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Scope & specifications</label>
              <Textarea
                rows={7}
                placeholder="Describe the atmosphere, attendee expectations, guest count, special technical jobs, and equipment expectations..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={showDescriptionError}
              />
              {showDescriptionError && (
                <p className="text-[11px] text-destructive mt-1.5 font-medium">Description is required</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Step 4: Logistics & Deliverables */}
      {step === 4 && (
        <Card padding="lg" className="space-y-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight leading-snug">
              When and where is this happening?
            </h2>
            <p className="text-sm text-ink-muted mt-3 leading-relaxed max-w-lg">
              Set the date slot, proposal deadline, and venue, then list what you expect talent to deliver.
            </p>
          </div>

          {/* Timing Mode Toggle */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-2">
              How do you want to specify timing?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTimingMode('fixed')}
                className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                  timingMode === 'fixed'
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                    : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
                }`}
              >
                I know the exact time
                <span className="block font-normal mt-0.5">e.g. 6:00 PM – 10:00 PM</span>
              </button>
              <button
                type="button"
                onClick={() => setTimingMode('flexible')}
                className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                  timingMode === 'flexible'
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                    : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
                }`}
              >
                I just need it done by a date
                <span className="block font-normal mt-0.5">No fixed hours, flexible timing</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                <Calendar className="w-3.5 h-3.5 text-ink-muted" />
                {timingMode === 'fixed' ? 'Event Date' : 'Complete By Date'}
              </label>
              <Input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                min={todayISODate()}
              />
            </div>

            {timingMode === 'fixed' && (
              <>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                    <Clock className="w-3.5 h-3.5 text-ink-muted" />
                    Start Time
                  </label>
                  <Input
                    type="time"
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                    <Clock className="w-3.5 h-3.5 text-ink-muted" />
                    End Time
                  </label>
                  <Input
                    type="time"
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                    aria-invalid={attemptedNext && eventEndTime <= eventStartTime}
                  />
                  {attemptedNext && eventEndTime <= eventStartTime && (
                    <p className="text-[11px] text-destructive mt-1 font-medium">
                      End time must be after start time.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Proposal Deadline</label>
            <Input
              type="date"
              value={proposalDeadline}
              onChange={(e) => setProposalDeadline(e.target.value)}
              min={todayISODate()}
              max={eventDate}
              className="w-full md:w-1/3"
            />
            <p className="text-[11px] text-ink-muted mt-1">Vendors must submit their proposals by this date.</p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
              <MapPin className="w-3.5 h-3.5 text-ink-muted" />
              Venue / Location Address
            </label>
            <Input
              type="text"
              placeholder="e.g. Spring Studios, 50 Varick St, New York, NY"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          {/* Deliverables Builder */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-ink">Required Deliverables Checklist</label>

            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Add a required deliverable item..."
                value={newDeliverableInput}
                onChange={(e) => setNewDeliverableInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDeliverable())}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddDeliverable}>
                Add
              </Button>
            </div>

            <div className="space-y-2 pt-2">
              {deliverables.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 bg-bg border border-border rounded-xl text-xs text-ink"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    {item}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveDeliverable(idx)}
                    className="text-zinc-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Step 5: Budget & Review */}
      {step === 5 && (
        <Card padding="lg" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight leading-snug">
                Set your target budget.
              </h2>
              <p className="text-sm text-ink-muted mt-3 leading-relaxed max-w-sm">
                Give a realistic range — this is what talent sees when deciding whether to propose.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-ink-muted" />
                  Minimum Budget ($)
                </label>
                <Input
                  type="number"
                  step={100}
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(Number(e.target.value))}
                  className="font-mono"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-ink-muted" />
                  Maximum Budget ($)
                </label>
                <Input
                  type="number"
                  step={100}
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(Number(e.target.value))}
                  className="font-mono"
                  aria-invalid={attemptedNext && budgetMax < budgetMin}
                />
                {attemptedNext && budgetMax < budgetMin && (
                  <p className="text-[11px] text-destructive mt-1 font-medium">
                    Maximum must be at least the minimum.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Summary Box */}
          <div className="p-6 bg-bg border border-border rounded-2xl space-y-4">
            <h3 className="text-xs font-mono uppercase font-bold text-primary tracking-wider">
              Job Summary
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Title:</span>
                <span className="font-semibold text-ink text-right">{title}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Category:</span>
                <span className="font-medium text-ink">{category}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Logistics:</span>
                <span className="font-medium text-ink">
                  {formatEventSchedule(eventDate, timingMode, eventStartTime, eventEndTime)} — {location}
                </span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Proposal Deadline:</span>
                <span className="font-medium text-ink">{proposalDeadline}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Budget:</span>
                <span className="font-bold text-primary">
                  ${budgetMin.toLocaleString()} - ${budgetMax.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Footer Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={handleBack}>
          Back
        </Button>
        <Button
          onClick={handleNext}
          icon={step === 5 ? Sparkles : ArrowRight}
          iconPosition={step === 5 ? 'left' : 'right'}
        >
          {step === 5 ? 'Publish Job to Marketplace' : `Next: ${STEP_LABELS[(step + 1) as WizardStep]}`}
        </Button>
      </div>

      {/* Progress Bar */}
      <div className="h-1 w-full bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${(step / 5) * 100}%` }}
        />
      </div>
    </div>
  );
};
