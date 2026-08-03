import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  IndianRupee,
  MapPin,
  Paperclip,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card, DatePicker, Input, TimePicker, Textarea } from '@marche/ui';
import { EventCategory, EventTimingMode, JobAttachment } from '../../types';
import { formatEventSchedule, todayISODate } from '../../lib/formatTime';
import { formatFileSize } from '../../lib/formatFile';
import { formatBudget } from '../../lib/formatBudget';
import { CATEGORIES as ALL_CATEGORIES } from '../../data/categoryOptions';

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB — kept modest since files are stored as base64 in localStorage
const MAX_ATTACHMENTS = 5;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const CATEGORIES = ALL_CATEGORIES.filter((c) => c !== 'All') as EventCategory[];

const TITLE_EXAMPLES: Partial<Record<EventCategory, string[]>> = {
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
    'Loft Venue for 100-Guest Product Launch, Bandra, Mumbai',
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

function RephraseWithAiButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  if (!show) return null;

  return (
    <button
      type="button"
      title="Rephrase with AI"
      aria-label="Rephrase with AI"
      onClick={onClick}
      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-primary-subtle text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-fg focus-visible:shadow-focus cursor-pointer"
    >
      <Sparkles className="h-3.5 w-3.5" />
    </button>
  );
}

interface CreateJobPageProps {
  draftId?: string;
}

export const CreateJobPage: React.FC<CreateJobPageProps> = ({ draftId }) => {
  const { createJob, saveJobDraft, publishJobDraft, getJobById, navigate } = useApp();

  const existingDraft = draftId ? getJobById(draftId) : undefined;

  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId ?? null);
  const [step, setStep] = useState<WizardStep>(1);
  const [attemptedNext, setAttemptedNext] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Form State — pre-filled from an existing draft when resuming one
  const [title, setTitle] = useState(existingDraft?.title ?? '');
  const [category, setCategory] = useState<EventCategory>(existingDraft?.category ?? 'Photography');
  const [description, setDescription] = useState(existingDraft?.description ?? '');
  const [location, setLocation] = useState(existingDraft?.location ?? 'Bandra, Mumbai, Maharashtra');
  const [eventDate, setEventDate] = useState(existingDraft?.eventDate ?? '2026-09-25');
  const [timingMode, setTimingMode] = useState<EventTimingMode>(existingDraft?.timingMode ?? 'fixed');
  const [eventStartTime, setEventStartTime] = useState(existingDraft?.eventStartTime ?? '18:00');
  const [eventEndTime, setEventEndTime] = useState(existingDraft?.eventEndTime ?? '22:00');
  const [proposalDeadline, setProposalDeadline] = useState(existingDraft?.proposalDeadline ?? '2026-09-10');
  const [budgetMode, setBudgetMode] = useState<'fixed' | 'range'>(existingDraft?.budgetMode ?? 'range');
  const [budgetMin, setBudgetMin] = useState<number>(existingDraft?.budgetMin ?? 2500);
  const [budgetMax, setBudgetMax] = useState<number>(existingDraft?.budgetMax ?? 4000);
  const [deliverables, setDeliverables] = useState<string[]>(
    existingDraft?.deliverables ?? [
      'High-resolution edited digital assets within 48h',
      'On-site production crew & equipment included',
      'Full commercial licensing for social & press',
    ]
  );
  const [newDeliverableInput, setNewDeliverableInput] = useState('');
  const [attachments, setAttachments] = useState<JobAttachment[]>(
    existingDraft?.attachments ?? []
  );
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setAttachmentError(null);

    const files = Array.from(fileList);
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }

    const oversized = files.find((f) => f.size > MAX_ATTACHMENT_SIZE);
    if (oversized) {
      setAttachmentError(`"${oversized.name}" exceeds the ${formatFileSize(MAX_ATTACHMENT_SIZE)} limit.`);
      return;
    }

    const newAttachments = await Promise.all(
      files.map(async (file) => ({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        dataUrl: await readFileAsDataUrl(file),
      }))
    );

    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

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
        return budgetMin > 0 && (budgetMode === 'fixed' || budgetMax >= budgetMin);
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

  const buildJobData = () => ({
    title,
    category,
    description,
    location,
    eventDate,
    timingMode,
    eventStartTime: timingMode === 'fixed' ? eventStartTime : undefined,
    eventEndTime: timingMode === 'fixed' ? eventEndTime : undefined,
    proposalDeadline,
    budgetMode,
    budgetMin,
    // AppContext normalizes budgetMax to budgetMin for fixed-budget jobs — no need to do it here too.
    budgetMax,
    deliverables,
    attachments,
  });

  const handleSaveDraft = () => {
    const saved = saveJobDraft(currentDraftId, buildJobData());
    setCurrentDraftId(saved.id);
    showToast('Draft saved. You can find it on your Client Dashboard.');
  };

  const handleAiRephraseClick = () => {
    showToast('AI rephrasing will be available soon.');
  };
  const handleSubmit = () => {
    if (!isStepValid(5)) {
      setAttemptedNext(true);
      return;
    }

    const data = buildJobData();
    const createdReq = currentDraftId ? publishJobDraft(currentDraftId, data) : createJob(data);

    navigate(`/client/jobs/${createdReq.id}`);
  };

  const currentPhaseIndex = PHASES.findIndex((p) => p.steps.includes(step));
  const showTitleError = attemptedNext && !isStepValid(2);
  const showDescriptionError = attemptedNext && !isStepValid(3);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-4">
      {toastMessage && (
        <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
          <span>{toastMessage}</span>
        </div>
      )}

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
          {step}/5 · Event Job{currentDraftId ? ' · Editing Draft' : ''}
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
              <div className="relative">
                <Input
                  type="text"
                  placeholder="e.g. Lead Editorial Photographer for NYC Luxury Brand Launch"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-invalid={showTitleError}
                  className={title.trim() ? 'pr-12' : undefined}
                />
                <RephraseWithAiButton show={!!title.trim()} onClick={handleAiRephraseClick} />
              </div>
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
              <div className="relative">
                <Textarea
                  rows={7}
                  placeholder="Describe the atmosphere, attendee expectations, guest count, special technical jobs, and equipment expectations..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-invalid={showDescriptionError}
                  className={description.trim() ? 'pr-12' : undefined}
                />
                <RephraseWithAiButton show={!!description.trim()} onClick={handleAiRephraseClick} />
              </div>
              {showDescriptionError && (
                <p className="text-[11px] text-destructive mt-1.5 font-medium">Description is required</p>
              )}

              {/* Reference Attachments */}
              <div className="mt-6 space-y-2.5">
                <label className="block text-xs font-semibold text-ink">
                  Reference documents <span className="font-normal text-ink-muted">(optional)</span>
                </label>
                <p className="text-[11px] text-ink-muted leading-relaxed">
                  Attach briefs, mood boards, floor plans, or spec sheets so providers have full context.
                  Up to {MAX_ATTACHMENTS} files, {formatFileSize(MAX_ATTACHMENT_SIZE)} each.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={Paperclip}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= MAX_ATTACHMENTS}
                >
                  Attach Files
                </Button>

                {attachmentError && (
                  <p className="text-[11px] text-destructive font-medium">{attachmentError}</p>
                )}

                {attachments.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center justify-between p-2.5 bg-bg border border-border rounded-xl text-xs text-ink"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <span className="truncate">{att.name}</span>
                          <span className="text-ink-muted shrink-0">({formatFileSize(att.size)})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att.id)}
                          className="text-zinc-400 hover:text-rose-600 p-1 transition-colors cursor-pointer shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                <CalendarIcon className="w-3.5 h-3.5 text-ink-muted" />
                {timingMode === 'fixed' ? 'Event Date' : 'Complete By Date'}
              </label>
              <DatePicker
                value={eventDate}
                onChange={setEventDate}
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
                  <TimePicker
                    value={eventStartTime}
                    onChange={setEventStartTime}
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                    <Clock className="w-3.5 h-3.5 text-ink-muted" />
                    End Time
                  </label>
                  <TimePicker
                    value={eventEndTime}
                    onChange={setEventEndTime}
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
            <DatePicker
              value={proposalDeadline}
              onChange={setProposalDeadline}
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
              placeholder="e.g. The Oberoi, Nariman Point, Mumbai, Maharashtra"
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
                Set a fixed amount or a realistic range — this is what talent sees when deciding whether to propose,
                and it determines what they're allowed to bid.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-2">
                  How do you want to set the budget?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setBudgetMode('fixed')}
                    className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                      budgetMode === 'fixed'
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                        : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
                    }`}
                  >
                    Fixed budget
                    <span className="block font-normal mt-0.5">Providers must bid this exact amount</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBudgetMode('range')}
                    className={`p-3 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                      budgetMode === 'range'
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                        : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
                    }`}
                  >
                    Budget range
                    <span className="block font-normal mt-0.5">Providers may bid anywhere within range</span>
                  </button>
                </div>
              </div>

              {budgetMode === 'fixed' ? (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                    <IndianRupee className="w-3.5 h-3.5 text-ink-muted" />
                    Fixed Budget (₹)
                  </label>
                  <Input
                    type="number"
                    step={100}
                    min={0}
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(Math.max(0, Number(e.target.value)))}
                    className="font-mono"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                      <IndianRupee className="w-3.5 h-3.5 text-ink-muted" />
                      Minimum Budget (₹)
                    </label>
                    <Input
                      type="number"
                      step={100}
                      min={0}
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(Math.max(0, Number(e.target.value)))}
                      className="font-mono"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                      <IndianRupee className="w-3.5 h-3.5 text-ink-muted" />
                      Maximum Budget (₹)
                    </label>
                    <Input
                      type="number"
                      step={100}
                      min={0}
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(Math.max(0, Number(e.target.value)))}
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
              )}
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
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Budget:</span>
                <span className="font-bold text-primary">
                  {formatBudget({ budgetMode, budgetMin, budgetMax })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Reference Documents:</span>
                <span className="font-medium text-ink">
                  {attachments.length > 0 ? `${attachments.length} attached` : 'None'}
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
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={handleSaveDraft}>
            Save as Draft
          </Button>
          <Button
            onClick={handleNext}
            icon={step === 5 ? Sparkles : ArrowRight}
            iconPosition={step === 5 ? 'left' : 'right'}
          >
            {step === 5 ? 'Publish Job to Marketplace' : `Next: ${STEP_LABELS[(step + 1) as WizardStep]}`}
          </Button>
        </div>
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

