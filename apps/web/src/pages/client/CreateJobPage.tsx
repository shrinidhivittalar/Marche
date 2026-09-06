import React from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { Button } from '@marche/ui';
import {
  useCreateJobForm,
  PHASES,
  STEP_LABELS,
  type WizardStep,
} from './createJob/useCreateJobForm';
import { Step1Category } from './createJob/Step1Category';
import { Step2Title } from './createJob/Step2Title';
import { Step3Description } from './createJob/Step3Description';
import { Step4Logistics } from './createJob/Step4Logistics';
import { Step5BudgetReview } from './createJob/Step5BudgetReview';

// The five-step wizard shell — progress indicator, step switch and footer
// nav. All state, validation and save/submit logic lives in
// useCreateJobForm; each step's own fields live in createJob/StepN*.tsx.
// See useCreateJobForm.ts for the product-level notes on what changed when
// this moved off mock data.

interface CreateJobPageProps {
  draftId?: string;
}

export const CreateJobPage: React.FC<CreateJobPageProps> = ({ draftId }) => {
  const form = useCreateJobForm(draftId);
  const {
    token,
    goBack,
    currentJobId,
    step,
    toastMessage,
    saving,
    submitError,
    uploading,
    handleNext,
    handleBack,
    handleSaveDraft,
    isEditingPublished,
    currentPhaseIndex,
  } = form;

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

      {step === 1 && <Step1Category form={form} />}
      {step === 2 && <Step2Title form={form} />}
      {step === 3 && <Step3Description form={form} />}
      {step === 4 && <Step4Logistics form={form} />}
      {step === 5 && <Step5BudgetReview form={form} />}

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
