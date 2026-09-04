import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  IndianRupee,
  Loader2,
  MapPin,
  Paperclip,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Card, DatePicker, Input, TimePicker, Textarea } from '@marche/ui';
import { EventTimingMode } from '../../types';
import { formatEventSchedule, todayISODate } from '../../lib/formatTime';
import { formatJobBudget } from '../../lib/formatJob';
import { useApiResource } from '../../hooks/useApiResource';
import { ApiError } from '../../lib/api';
import { marketplaceApi } from '../../lib/marketplace-api';
import { mediaApi } from '../../lib/media-api';
import { jobsApi, AI_JOB_DRAFT_STORAGE_KEY, type JobBody } from '../../lib/jobs-api';
import {
  categoryTemplatesApi,
  type PublicCategoryTemplate,
  type ServiceMode,
} from '../../lib/category-templates-api';
import {
  CategoryRequirementsFields,
  defaultCategoryData,
  validateCategoryData,
  type CategoryDataValues,
} from './CategoryRequirementsFields';

// Post a requirement, on the real Jobs API.
//
// The five-step shape survives the rewire intact. Two of the toggles turned
// out to be input modes rather than data:
//
// - timingMode. "I know the exact hours" sends eventStartTime/eventEndTime;
//   "done by a date" omits them. The API has no timingMode column because
//   the presence of the times already says which one it was.
// - budgetMode. "Fixed" sends the same number as budgetMin and budgetMax,
//   which is exactly what fixed means. A mode column would store that fact
//   a second time and let the two disagree.
//
// What genuinely changed:
//
// - Categories come from the API. The mock picked from a hardcoded list of
//   display names; the server matches on a seeded category id.
// - Attachments go through the media pipeline instead of being read into
//   base64 and kept in localStorage. Files upload as they are chosen, and
//   are attached to the requirement once it exists — a requirement has to
//   have an id before anything can hang off it.
// - The form starts empty. The mock pre-filled a venue, a date and three
//   deliverables to make the screen look alive, which on a real API means a
//   distracted client publishes a requirement for an event in Bandra they
//   never typed.

// The media pipeline accepts these and nothing else; an executable renamed
// to .jpg is rejected server-side after upload by its magic bytes.
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

// Matches JobsService.MAX_ATTACHMENTS. Stated here so the button disables
// before a request is refused.
const MAX_ATTACHMENTS = 10;

// Set by PostJobIntroPage's AI prompt flow (jobsApi.rephraseField run against
// the client's free-text prompt) right before navigating here — read once on
// mount and cleared, so a direct visit to this route never picks up stale
// content from an earlier AI session.
function readAiDraftPrefill(): { title: string; description: string } | null {
  const raw = sessionStorage.getItem(AI_JOB_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { title: string; description: string };
  } catch {
    return null;
  }
}

// Mirrors the DTO, so a client is told before submitting rather than after.
const MIN_TITLE = 3;
const MIN_DESCRIPTION = 20;

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

// Kept as guidance rather than generated, and keyed by the category name the
// API returns so a renamed or new category simply shows none.
const TITLE_EXAMPLES: Record<string, string[]> = {
  Photography: [
    'Lead Editorial Photographer for Luxury Brand Launch',
    'Wedding Photographer for 200-Guest Rooftop Ceremony',
  ],
  Catering: [
    'Full-Service Catering for 150-Guest Rooftop Wedding',
    'Plated Dinner Service for Corporate Gala, 80 Covers',
  ],
  Venue: [
    'Loft Venue for 100-Guest Product Launch, Bandra, Mumbai',
    'Outdoor Garden Venue for 150-Guest Summer Wedding',
  ],
};

/** A file that has finished uploading, and its attachment row once one exists. */
interface PendingAttachment {
  mediaId: string;
  fileName: string;
  /** Set once attached to a saved requirement; what a detach targets. */
  attachmentId?: string;
}

function RephraseWithAiButton({
  show,
  loading,
  onClick,
}: {
  show: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!show) return null;

  return (
    <button
      type="button"
      title="Rephrase with AI"
      aria-label="Rephrase with AI"
      aria-busy={loading}
      disabled={loading}
      onClick={onClick}
      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-primary-subtle text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-fg focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-60 cursor-pointer"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

interface CreateJobPageProps {
  draftId?: string;
}

export const CreateJobPage: React.FC<CreateJobPageProps> = ({ draftId }) => {
  const { navigate, goBack, accessToken } = useApp();
  const token = accessToken as string;

  const categories = useApiResource(() => marketplaceApi.categories(), []);

  // A draft being resumed. Loaded through the owner route, so it works
  // whatever state the requirement is in.
  const draft = useApiResource(() => jobsApi.mineById(token, draftId as string), [draftId, token], {
    enabled: Boolean(draftId && token),
  });

  // The files already hanging off that draft. A separate request because the
  // requirement itself does not carry them, and without it a resumed draft
  // reports "None" while the files are still attached server-side — so a
  // client re-uploads and ends up with duplicates.
  const draftAttachments = useApiResource(
    () => jobsApi.attachments(token, draftId as string),
    [draftId, token],
    { enabled: Boolean(draftId && token) },
  );

  const [currentJobId, setCurrentJobId] = useState<string | null>(draftId ?? null);
  const [step, setStep] = useState<WizardStep>(1);
  const [attemptedNext, setAttemptedNext] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rephrasing, setRephrasing] = useState<'title' | 'description' | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Empty defaults on purpose — see the note at the top of the file. The one
  // exception is content the client actually provided: PostJobIntroPage's AI
  // prompt flow, handed off via sessionStorage (see readAiDraftPrefill)
  // rather than faked demo data.
  const [title, setTitle] = useState(() => (draftId ? '' : (readAiDraftPrefill()?.title ?? '')));
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState(() =>
    draftId ? '' : (readAiDraftPrefill()?.description ?? ''),
  );
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [timingMode, setTimingMode] = useState<EventTimingMode>('fixed');
  const [eventStartTime, setEventStartTime] = useState('18:00');
  const [eventEndTime, setEventEndTime] = useState('22:00');
  const [proposalDeadline, setProposalDeadline] = useState('');
  const [budgetMode, setBudgetMode] = useState<'fixed' | 'range'>('range');
  const [budgetMin, setBudgetMin] = useState<number>(0);
  const [budgetMax, setBudgetMax] = useState<number>(0);
  const [deliverables, setDeliverables] = useState<string[]>([]);
  const [newDeliverableInput, setNewDeliverableInput] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Category-template-driven state. `originalCategoryId` is the category
  // the loaded draft actually belongs to (null in create mode, where every
  // category pick counts as "changed") — comparing the live `categoryId`
  // against it, not against "did the dropdown fire an onChange this
  // session", is what lets picking a different category and then picking
  // the original one back restore the job's own locked template rather
  // than whatever is active for that category right now.
  const [originalCategoryId, setOriginalCategoryId] = useState<string | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryDataValues>({});
  const [serviceMode, setServiceMode] = useState<ServiceMode | ''>('');

  // Consumed once, on mount — a later direct visit to this route (or a
  // resumed draft) must not pick up an earlier AI session's leftovers.
  useEffect(() => {
    if (!draftId) sessionStorage.removeItem(AI_JOB_DRAFT_STORAGE_KEY);
  }, [draftId]);

  // Seeding a resumed draft. Keyed off the loaded id so it runs once per
  // draft rather than on every render, and never overwrites typing.
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  if (draft.data && seededFrom !== draft.data.id) {
    const loaded = draft.data;
    setSeededFrom(loaded.id);
    setTitle(loaded.title);
    setCategoryId(loaded.category.id);
    setOriginalCategoryId(loaded.category.id);
    setCategoryData(loaded.categoryData ?? {});
    setServiceMode(loaded.serviceMode ?? '');
    setDescription(loaded.description);
    setLocation(loaded.locationCoarse ?? '');
    setEventDate(loaded.eventDate ? loaded.eventDate.slice(0, 10) : '');
    // No stored timingMode: the presence of times is what it meant.
    setTimingMode(loaded.eventStartTime ? 'fixed' : 'flexible');
    if (loaded.eventStartTime) setEventStartTime(loaded.eventStartTime);
    if (loaded.eventEndTime) setEventEndTime(loaded.eventEndTime);
    setProposalDeadline(loaded.proposalDeadline ? loaded.proposalDeadline.slice(0, 10) : '');
    // Likewise: equal bounds is what "fixed" means.
    setBudgetMode(loaded.budgetMin && loaded.budgetMin === loaded.budgetMax ? 'fixed' : 'range');
    setBudgetMin(Number(loaded.budgetMin ?? 0));
    setBudgetMax(Number(loaded.budgetMax ?? 0));
    setDeliverables(loaded.deliverables);
  }

  // Same once-per-draft seeding for the attachments. Each one carries its
  // attachmentId, so removing a loaded file detaches it on the server
  // instead of only disappearing from this list. Anything uploaded while
  // the request was in flight is kept — the load must not undo it.
  const [seededAttachmentsFrom, setSeededAttachmentsFrom] = useState<string | null>(null);
  if (draftAttachments.data && draftId && seededAttachmentsFrom !== draftId) {
    const loaded = draftAttachments.data;
    setSeededAttachmentsFrom(draftId);
    setAttachments((prev) => [
      ...loaded.map((a) => ({
        mediaId: a.mediaId,
        // The API leaves fileName null for files uploaded without one; the
        // row still needs something to name and to label its remove button.
        fileName: a.fileName ?? 'Attachment',
        attachmentId: a.id,
      })),
      ...prev,
    ]);
  }

  const selectedCategory = (categories.data ?? []).find((c) => c.id === categoryId);

  // True in create mode as soon as any category is picked (there is no
  // "original" to compare against there), and in edit mode only once the
  // selector actually points somewhere other than the job's own category.
  const isCategoryChangedFromOriginal = categoryId !== originalCategoryId;

  // CREATE, or EDIT with the category changed: the category's *current*
  // active template — the same one JobsService will re-resolve at submit.
  // EDIT with the category unchanged: the job's own *locked* version, by
  // id — never the category's current active template, since an admin may
  // have published a newer one since this job was created. No lock and no
  // change means no template at all, exactly as it was when the job was
  // made — see CategoryTemplatesService.resolveLockedTemplate's own
  // reasoning for why these are not interchangeable.
  const lockedTemplateId = draft.data?.categoryTemplateId ?? null;
  // Tagged with the category it was actually fetched for. useApiResource
  // only replaces `data` once a fetch resolves — it does not clear it the
  // instant deps change — so right after picking a new category, `data`
  // can still be the previous category's template for one render, before
  // the effect that starts the new fetch has even run. Deriving
  // `activeTemplate` below by comparing this tag against the live
  // `categoryId` (not just trusting `templateResource.data`) is what keeps
  // that one render from ever pairing the old category's field labels with
  // the just-cleared `categoryData` — it falls through to the "no
  // requirements" empty state instead until the real fetch settles.
  const templateResource = useApiResource<{
    categoryId: string;
    template: PublicCategoryTemplate | null;
  } | null>(
    () => {
      if (!selectedCategory) return Promise.resolve(null);
      const forCategoryId = selectedCategory.id;
      if (!isCategoryChangedFromOriginal) {
        if (!lockedTemplateId)
          return Promise.resolve({ categoryId: forCategoryId, template: null });
        return categoryTemplatesApi
          .getVersionPublic(selectedCategory.slug, lockedTemplateId)
          .then((res) => ({ categoryId: forCategoryId, template: res.template }));
      }
      return categoryTemplatesApi
        .getActive(selectedCategory.slug)
        .then((res) => ({ categoryId: forCategoryId, template: res.template }));
    },
    [selectedCategory?.slug, isCategoryChangedFromOriginal, lockedTemplateId],
    { enabled: Boolean(selectedCategory) },
  );
  const activeTemplate =
    templateResource.data && templateResource.data.categoryId === categoryId
      ? templateResource.data.template
      : null;

  // Fills in defaults (BOOLEAN → false, MULTI_SELECT → []) the first time a
  // given template resolves, without disturbing anything already typed —
  // the same once-per-id render-time-guarded pattern the draft/attachment
  // seeding above already uses, rather than a useEffect.
  const [defaultsAppliedFor, setDefaultsAppliedFor] = useState<string | null>(null);
  if (activeTemplate && defaultsAppliedFor !== activeTemplate.id) {
    setDefaultsAppliedFor(activeTemplate.id);
    setCategoryData((prev) => ({ ...defaultCategoryData(activeTemplate.fields), ...prev }));
  }

  // Changing category discards the previous category's answers and
  // service mode outright — they were never validated against the new
  // category's template and may not even correspond to real fields on it.
  // Landing back on the job's own original category restores exactly what
  // was loaded for it, not an empty form, since that is what the job is
  // actually still locked to.
  const handleSelectCategory = (nextCategoryId: string) => {
    if (nextCategoryId === categoryId) return;
    setCategoryId(nextCategoryId);
    if (nextCategoryId === originalCategoryId && draft.data) {
      setCategoryData(draft.data.categoryData ?? {});
      setServiceMode(draft.data.serviceMode ?? '');
    } else {
      setCategoryData({});
      setServiceMode('');
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setAttachmentError(null);

    const room = MAX_ATTACHMENTS - attachments.length;
    const files = Array.from(fileList).slice(0, room);
    if (fileList.length > room) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    }

    setUploading(true);
    try {
      // Uploaded as they are chosen rather than held until submit: the file
      // goes straight to storage, and by the time the requirement is saved
      // there is a verified media id ready to attach.
      for (const file of files) {
        const uploaded = await mediaApi.upload(token, file);
        setAttachments((prev) => [...prev, { mediaId: uploaded.mediaId, fileName: file.name }]);
      }
    } catch (err) {
      // The API's messages name the actual limit or type, which is more
      // use than a generic failure.
      setAttachmentError(
        err instanceof ApiError
          ? err.message
          : "That file couldn't be uploaded. Check your connection and try again.",
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = async (mediaId: string) => {
    const attachment = attachments.find((a) => a.mediaId === mediaId);
    setAttachments((prev) => prev.filter((a) => a.mediaId !== mediaId));

    // Only needs a call if it reached the requirement. An upload that was
    // never attached is just a file the user owns.
    if (attachment?.attachmentId && currentJobId) {
      try {
        await jobsApi.removeAttachment(token, currentJobId, attachment.attachmentId);
      } catch {
        // Already gone from the list either way; a failure here would
        // otherwise strand the row back on screen with no way to retry.
      }
    }
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
        if (!categoryId) return false;
        // Blocks on a template fetch that hasn't resolved yet (or failed)
        // rather than letting Next through — proceeding on an unknown
        // template would either submit incomplete categoryData or, if
        // nothing was rendered at all yet, silently skip requirements the
        // backend is about to enforce anyway.
        if (templateResource.loading || templateResource.error) return false;
        if (!activeTemplate) return true;
        return Object.values(validateCategoryData(activeTemplate.fields, categoryData)).every(
          (e) => e === null,
        );
      case 2:
        return title.trim().length >= MIN_TITLE;
      case 3:
        return description.trim().length >= MIN_DESCRIPTION;
      case 4:
        // Only the timing relationship, plus a template's own
        // locationRequired, are enforced. A date, a deadline and a venue
        // are otherwise all optional on the API, and inventing extra
        // required fields here would refuse requirements the server would
        // accept.
        return (
          (timingMode !== 'fixed' ||
            !eventDate ||
            (!!eventStartTime && !!eventEndTime && eventEndTime > eventStartTime)) &&
          (!activeTemplate?.locationRequired || location.trim().length > 0)
        );
      case 5:
        // A maximum of zero means "no upper bound", not "zero rupees" — the
        // API stores no maximum and the card reads "From ₹25,000". Only a
        // maximum that was actually entered has to clear the minimum.
        return budgetMode === 'fixed' || budgetMax === 0 || budgetMax >= budgetMin;
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
      void handleSubmit();
      return;
    }
    goToStep((step + 1) as WizardStep);
  };

  const handleBack = () => {
    if (step === 1) {
      goBack();
      return;
    }
    goToStep((step - 1) as WizardStep);
  };

  const buildBody = (): JobBody => ({
    title: title.trim(),
    description: description.trim(),
    categoryId,
    // Zero means "not stated" rather than free, so it is sent as absent.
    budgetMin: budgetMin > 0 ? budgetMin : undefined,
    budgetMax:
      budgetMode === 'fixed'
        ? budgetMin > 0
          ? budgetMin
          : undefined
        : budgetMax > 0
          ? budgetMax
          : undefined,
    locationCoarse: location.trim() || undefined,
    serviceMode: serviceMode || undefined,
    // Always the full current answer set rather than a computed diff —
    // simpler, and JobsService already treats an update's categoryData as
    // a full replacement, not a merge. Absent (not an empty object) when no
    // template governs this category, matching categoryData's own
    // null-iff-no-template invariant.
    categoryData: activeTemplate ? categoryData : undefined,
    eventDate: eventDate ? new Date(eventDate).toISOString() : undefined,
    // Times only exist in fixed mode, and only alongside a date — which is
    // what the API enforces too.
    eventStartTime: timingMode === 'fixed' && eventDate ? eventStartTime : undefined,
    eventEndTime: timingMode === 'fixed' && eventDate ? eventEndTime : undefined,
    proposalDeadline: proposalDeadline ? new Date(proposalDeadline).toISOString() : undefined,
    deliverables,
  });

  /**
   * Saves the form and returns the requirement's id, creating it the first
   * time and updating it after. Attachments are synced here because they
   * need an id to hang off.
   */
  const saveJob = async (): Promise<string> => {
    const body = buildBody();
    const job = currentJobId
      ? await jobsApi.update(token, currentJobId, body)
      : await jobsApi.create(token, body);

    setCurrentJobId(job.id);

    const unattached = attachments.filter((a) => !a.attachmentId);
    for (const pending of unattached) {
      const created = await jobsApi.addAttachment(token, job.id, pending.mediaId);
      setAttachments((prev) =>
        prev.map((a) => (a.mediaId === pending.mediaId ? { ...a, attachmentId: created.id } : a)),
      );
    }

    return job.id;
  };

  const runSave = async (action: (jobId: string) => Promise<void> | void) => {
    setSubmitError(null);
    setSaving(true);
    try {
      const jobId = await saveJob();
      await action(jobId);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : "That couldn't be saved. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Publishing an already-PUBLISHED job is a harmless no-op server-side
  // (JobsService.publish), but calling it at all is unnecessary — and
  // confusing in the toast/label — when editing a live requirement rather
  // than finishing a draft.
  const isEditingPublished = draft.data?.status === 'PUBLISHED';

  const handleSaveDraft = () => {
    if (!isStepValid(1) || !isStepValid(2) || !isStepValid(3)) {
      setSubmitError(
        'A draft still needs a category, a title and a description before it can be saved.',
      );
      return;
    }
    void runSave(() =>
      showToast(
        isEditingPublished ? 'Changes saved.' : 'Draft saved. You can find it on your dashboard.',
      ),
    );
  };

  const handleSubmit = async () => {
    if (!isStepValid(5)) {
      setAttemptedNext(true);
      return;
    }
    // Saved first, then published: publish takes no body, so anything typed
    // on the last step would otherwise be left behind.
    await runSave(async (jobId) => {
      if (!isEditingPublished) {
        await jobsApi.publish(token, jobId);
      }
      navigate(`/client/jobs/${jobId}`);
    });
  };

  const handleAiRephraseClick = async (field: 'title' | 'description') => {
    const value = field === 'title' ? title : description;
    if (!value.trim() || rephrasing) return;

    setRephrasing(field);
    try {
      const { text } = await jobsApi.rephraseField(token, field, value);
      if (field === 'title') setTitle(text);
      else setDescription(text);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'AI rephrasing failed. Please try again.');
    } finally {
      setRephrasing(null);
    }
  };

  const currentPhaseIndex = PHASES.findIndex((p) => p.steps.includes(step));
  const showTitleError = attemptedNext && !isStepValid(2);
  const showDescriptionError = attemptedNext && !isStepValid(3);

  if (!token) {
    return (
      <p className="text-xs text-ink-muted py-12 text-center">Sign in to post a requirement.</p>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-4">
      {toastMessage && (
        <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
          <span>{toastMessage}</span>
        </div>
      )}

      <button
        onClick={goBack}
        className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      <div className="flex items-center justify-center gap-3 sm:gap-6 py-2">
        {PHASES.map((phase, idx) => {
          const state =
            idx < currentPhaseIndex ? 'done' : idx === currentPhaseIndex ? 'current' : 'upcoming';
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
                <div
                  className={`h-px flex-1 mt-[-1.25rem] ${idx < currentPhaseIndex ? 'bg-primary' : 'bg-border'}`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="text-center">
        <span className="text-xs font-mono uppercase font-semibold text-ink-muted">
          {step}/5 · Requirement{currentJobId ? ' · Editing Draft' : ''}
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
                Pick the category that best fits your event. This routes your requirement to the
                right verified talent.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {categories.loading && (
                <p className="text-xs text-ink-muted col-span-2">Loading categories…</p>
              )}
              {categories.error && (
                <p className="text-xs text-destructive col-span-2" data-testid="categories-error">
                  Categories could not be loaded. {categories.error}
                </p>
              )}
              {(categories.data ?? []).map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  data-testid={`category-${cat.slug}`}
                  onClick={() => handleSelectCategory(cat.id)}
                  className={`p-3.5 rounded-xl border text-left text-xs font-medium transition-all cursor-pointer ${
                    categoryId === cat.id
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                      : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {categoryId && (
            <div
              className="mt-8 pt-6 border-t border-border"
              data-testid="category-requirements-section"
            >
              {templateResource.loading ? (
                <p className="text-xs text-ink-muted" data-testid="template-loading">
                  Loading this category's requirements…
                </p>
              ) : templateResource.error ? (
                <p className="text-xs text-destructive" data-testid="template-error">
                  Requirements could not be loaded. {templateResource.error}
                </p>
              ) : activeTemplate ? (
                <div className="space-y-4" data-testid="category-requirements-fields">
                  <div>
                    <h3 className="text-sm font-bold text-ink">
                      {selectedCategory?.name} Requirements
                    </h3>
                    <p className="text-[11px] text-ink-muted mt-0.5">
                      Answer these so the right talent can quote accurately.
                    </p>
                  </div>
                  <CategoryRequirementsFields
                    fields={activeTemplate.fields}
                    values={categoryData}
                    onChange={(key, value) =>
                      setCategoryData((prev) => ({ ...prev, [key]: value }))
                    }
                    showErrors={attemptedNext}
                  />
                </div>
              ) : (
                <p className="text-xs text-ink-muted" data-testid="category-requirements-empty">
                  No extra requirements are configured for this category yet.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Step 2: Title */}
      {step === 2 && (
        <Card padding="lg">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight leading-snug">
                Let&apos;s start with a strong title.
              </h2>
              <p className="text-sm text-ink-muted mt-3 leading-relaxed max-w-sm">
                This is the first thing talent sees, so make it count. Be specific about the role
                and the occasion.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Write a title for your requirement
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="e.g. Lead Editorial Photographer for Luxury Brand Launch"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-invalid={showTitleError}
                  data-testid="job-title-input"
                  className={title.trim() ? 'pr-12' : undefined}
                />
                <RephraseWithAiButton
                  show={!!title.trim()}
                  loading={rephrasing === 'title'}
                  onClick={() => void handleAiRephraseClick('title')}
                />
              </div>
              {showTitleError && (
                <p className="text-[11px] text-destructive mt-1.5 font-medium">
                  A title of at least {MIN_TITLE} characters is required.
                </p>
              )}

              {(TITLE_EXAMPLES[selectedCategory?.name ?? ''] ?? []).length > 0 && (
                <div className="mt-6 space-y-2">
                  <p className="text-xs font-semibold text-ink">Example titles</p>
                  <ul className="space-y-1.5">
                    {(TITLE_EXAMPLES[selectedCategory?.name ?? ''] ?? []).map((example) => (
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
              )}
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
                Cover the atmosphere, guest count, and any technical or equipment expectations. The
                more context you give, the more accurate the proposals you&apos;ll receive.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Scope &amp; specifications
              </label>
              <div className="relative">
                <Textarea
                  rows={7}
                  placeholder="Describe the atmosphere, attendee expectations, guest count, and equipment expectations..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-invalid={showDescriptionError}
                  data-testid="job-description-input"
                  className={description.trim() ? 'pr-12' : undefined}
                />
                <RephraseWithAiButton
                  show={!!description.trim()}
                  loading={rephrasing === 'description'}
                  onClick={() => void handleAiRephraseClick('description')}
                />
              </div>
              {showDescriptionError && (
                <p className="text-[11px] text-destructive mt-1.5 font-medium">
                  A description of at least {MIN_DESCRIPTION} characters is required.
                </p>
              )}

              <div className="mt-6 space-y-2.5">
                <label className="block text-xs font-semibold text-ink">
                  Reference documents <span className="font-normal text-ink-muted">(optional)</span>
                </label>
                <p className="text-[11px] text-ink-muted leading-relaxed">
                  Attach briefs, mood boards or floor plans so providers have full context. JPEG,
                  PNG, WebP or PDF, up to {MAX_ATTACHMENTS} files. Only providers signed in and
                  viewing your published requirement can open them.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  data-testid="job-file-input"
                  onChange={(e) => void handleFilesSelected(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={Paperclip}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || attachments.length >= MAX_ATTACHMENTS}
                >
                  {uploading ? 'Uploading…' : 'Attach Files'}
                </Button>

                {attachmentError && (
                  <p className="text-[11px] text-destructive font-medium" role="alert">
                    {attachmentError}
                  </p>
                )}

                {attachments.length > 0 && (
                  <div className="space-y-2 pt-1" data-testid="job-attachments">
                    {attachments.map((att) => (
                      <div
                        key={att.mediaId}
                        className="flex items-center justify-between p-2.5 bg-bg border border-border rounded-xl text-xs text-ink"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <span className="truncate">{att.fileName}</span>
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${att.fileName}`}
                          onClick={() => void handleRemoveAttachment(att.mediaId)}
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
              Set the date slot, proposal deadline and venue, then list what you expect talent to
              deliver. All of these are optional — a requirement can be published without them.
            </p>
          </div>

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
              <DatePicker value={eventDate} onChange={setEventDate} min={todayISODate()} />
            </div>

            {timingMode === 'fixed' && (
              <>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
                    <Clock className="w-3.5 h-3.5 text-ink-muted" />
                    Start Time
                  </label>
                  <TimePicker value={eventStartTime} onChange={setEventStartTime} />
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

          {timingMode === 'fixed' && !eventDate && (
            // Times need a date to belong to, which the API enforces too.
            <p className="text-[11px] text-ink-muted">
              Set an event date to save the hours with it.
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Proposal Deadline</label>
            <DatePicker
              value={proposalDeadline}
              onChange={setProposalDeadline}
              min={todayISODate()}
              max={eventDate || undefined}
              className="w-full md:w-1/3"
            />
            <p className="text-[11px] text-ink-muted mt-1">
              Providers must submit their proposals by this date.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-2">
              How will this be delivered?
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {(activeTemplate && activeTemplate.allowedModes.length > 0
                ? activeTemplate.allowedModes
                : (['ONSITE', 'REMOTE', 'HYBRID'] as ServiceMode[])
              ).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-testid={`service-mode-${mode}`}
                  onClick={() => setServiceMode(mode)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                    serviceMode === mode
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                      : 'border-border bg-bg text-ink-muted hover:text-ink hover:border-zinc-300'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-1">
              <MapPin className="w-3.5 h-3.5 text-ink-muted" />
              Venue / Location Address
              {activeTemplate?.locationRequired && <span className="text-destructive">*</span>}
            </label>
            <Input
              type="text"
              placeholder="e.g. The Oberoi, Nariman Point, Mumbai"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              aria-invalid={attemptedNext && activeTemplate?.locationRequired && !location.trim()}
              data-testid="job-location-input"
            />
            {attemptedNext && activeTemplate?.locationRequired && !location.trim() && (
              <p className="text-[11px] text-destructive mt-1 font-medium">
                This category requires a location.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-ink">
              Required Deliverables Checklist
            </label>

            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Add a required deliverable item..."
                value={newDeliverableInput}
                onChange={(e) => setNewDeliverableInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddDeliverable();
                  }
                }}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddDeliverable}>
                Add
              </Button>
            </div>

            <div className="space-y-2 pt-2">
              {deliverables.map((item, idx) => (
                <div
                  key={`${item}-${idx}`}
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
                Set a fixed amount or a realistic range — this is what talent sees when deciding
                whether to propose. Leave it at zero to invite quotes instead.
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
                    <span className="block font-normal mt-0.5">A single figure</span>
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
                    <span className="block font-normal mt-0.5">A minimum and a maximum</span>
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
                    data-testid="job-budget-input"
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
                      data-testid="job-budget-input"
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
                      aria-invalid={attemptedNext && budgetMax > 0 && budgetMax < budgetMin}
                    />
                    {attemptedNext && budgetMax > 0 && budgetMax < budgetMin ? (
                      <p className="text-[11px] text-destructive mt-1 font-medium">
                        Maximum must be at least the minimum.
                      </p>
                    ) : (
                      <p className="text-[11px] text-ink-muted mt-1">
                        Leave at zero for no upper limit.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-6 bg-bg border border-border rounded-2xl space-y-4">
            <h3 className="text-xs font-mono uppercase font-bold text-primary tracking-wider">
              Requirement Summary
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Title:</span>
                <span className="font-semibold text-ink text-right">{title}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Category:</span>
                <span className="font-medium text-ink">{selectedCategory?.name ?? '—'}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Logistics:</span>
                <span className="font-medium text-ink text-right">
                  {eventDate
                    ? formatEventSchedule(eventDate, timingMode, eventStartTime, eventEndTime)
                    : 'No date set'}
                  {location ? ` — ${location}` : ''}
                </span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Proposal Deadline:</span>
                <span className="font-medium text-ink">{proposalDeadline || 'None'}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Budget:</span>
                {/* Formatted from the same values buildBody sends, so the
                    summary cannot claim a budget the API will not store. */}
                <span className="font-bold text-primary" data-testid="summary-budget">
                  {formatJobBudget({
                    budgetMin: budgetMin > 0 ? String(budgetMin) : null,
                    budgetMax:
                      budgetMode === 'fixed'
                        ? budgetMin > 0
                          ? String(budgetMin)
                          : null
                        : budgetMax > 0
                          ? String(budgetMax)
                          : null,
                  })}
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

      {submitError && (
        <p
          className="text-xs text-destructive font-medium"
          role="alert"
          data-testid="job-submit-error"
        >
          {submitError}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={handleBack} disabled={saving}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={handleSaveDraft} disabled={saving || uploading}>
            {isEditingPublished ? 'Save' : 'Save as Draft'}
          </Button>
          <Button
            onClick={handleNext}
            disabled={saving || uploading}
            data-testid={step === 5 ? 'publish-job' : 'wizard-next'}
            icon={step === 5 ? Sparkles : ArrowRight}
            iconPosition={step === 5 ? 'left' : 'right'}
          >
            {saving
              ? 'Saving…'
              : step === 5
                ? isEditingPublished
                  ? 'Save Changes'
                  : 'Publish Requirement'
                : `Next: ${STEP_LABELS[(step + 1) as WizardStep]}`}
          </Button>
        </div>
      </div>

      <div className="h-1 w-full bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${(step / 5) * 100}%` }}
        />
      </div>
    </div>
  );
};
