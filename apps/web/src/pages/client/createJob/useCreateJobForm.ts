import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { EventTimingMode } from '../../../types';
import { useApiResource } from '../../../hooks/useApiResource';
import { ApiError } from '../../../lib/api';
import { marketplaceApi } from '../../../lib/marketplace-api';
import { mediaApi } from '../../../lib/media-api';
import { jobsApi, AI_JOB_DRAFT_STORAGE_KEY, type JobBody } from '../../../lib/jobs-api';
import {
  categoryTemplatesApi,
  type PublicCategoryTemplate,
  type ServiceMode,
} from '../../../lib/category-templates-api';
import {
  defaultCategoryData,
  validateCategoryData,
  type CategoryDataValues,
} from '../CategoryRequirementsFields';

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
export const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

// Matches JobsService.MAX_ATTACHMENTS. Stated here so the button disables
// before a request is refused.
export const MAX_ATTACHMENTS = 10;

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
export const MIN_TITLE = 3;
export const MIN_DESCRIPTION = 20;

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Category',
  2: 'Title',
  3: 'Description',
  4: 'Logistics',
  5: 'Budget & Review',
};

export const PHASES: { label: string; steps: WizardStep[] }[] = [
  { label: 'Scope the job', steps: [1, 2, 3] },
  { label: 'Set logistics', steps: [4] },
  { label: 'Budget & publish', steps: [5] },
];

// Kept as guidance rather than generated, and keyed by the category name the
// API returns so a renamed or new category simply shows none.
export const TITLE_EXAMPLES: Record<string, string[]> = {
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
export interface PendingAttachment {
  mediaId: string;
  fileName: string;
  /** Set once attached to a saved requirement; what a detach targets. */
  attachmentId?: string;
}

/**
 * All state, derived values and handlers behind the 5-step create-job
 * wizard — extracted from CreateJobPage so the step components (and the
 * page's own shell) can each read a single `form` prop instead of two
 * dozen individually-drilled props. Pure relocation of the original
 * CreateJobPage's logic; no behavior changed.
 */
export function useCreateJobForm(draftId: string | undefined) {
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

  // Flattened parent + children — a job can be posted against a leaf
  // (child) category as well as a standalone top-level one (Photography,
  // Painting, Electrical Work have no children), and categories.data is a
  // tree (GET /categories returns parents with nested children), so a
  // parent-only lookup would never find a selected child.
  const flatCategories = (categories.data ?? []).flatMap((c) => [c, ...(c.children ?? [])]);
  const selectedCategory = flatCategories.find((c) => c.id === categoryId);

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

  return {
    token,
    goBack,
    categories,
    currentJobId,
    step,
    attemptedNext,
    toastMessage,
    saving,
    submitError,
    rephrasing,
    title,
    setTitle,
    categoryId,
    description,
    setDescription,
    location,
    setLocation,
    eventDate,
    setEventDate,
    timingMode,
    setTimingMode,
    eventStartTime,
    setEventStartTime,
    eventEndTime,
    setEventEndTime,
    proposalDeadline,
    setProposalDeadline,
    budgetMode,
    setBudgetMode,
    budgetMin,
    setBudgetMin,
    budgetMax,
    setBudgetMax,
    deliverables,
    newDeliverableInput,
    setNewDeliverableInput,
    attachments,
    attachmentError,
    uploading,
    fileInputRef,
    categoryData,
    setCategoryData,
    serviceMode,
    setServiceMode,
    flatCategories,
    selectedCategory,
    templateResource,
    activeTemplate,
    handleSelectCategory,
    handleFilesSelected,
    handleRemoveAttachment,
    handleAddDeliverable,
    handleRemoveDeliverable,
    isStepValid,
    goToStep,
    handleNext,
    handleBack,
    handleSaveDraft,
    handleAiRephraseClick,
    isEditingPublished,
    currentPhaseIndex,
    showTitleError,
    showDescriptionError,
  };
}

export type CreateJobForm = ReturnType<typeof useCreateJobForm>;
