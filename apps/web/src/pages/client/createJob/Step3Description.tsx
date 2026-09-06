import { FileText, Paperclip, X } from 'lucide-react';
import { Button, Card, Textarea } from '@marche/ui';
import { RephraseWithAiButton } from './RephraseWithAiButton';
import { ACCEPT, MAX_ATTACHMENTS, MIN_DESCRIPTION } from './useCreateJobForm';
import type { CreateJobForm } from './useCreateJobForm';

export function Step3Description({ form }: { form: CreateJobForm }) {
  const {
    description,
    setDescription,
    showDescriptionError,
    rephrasing,
    handleAiRephraseClick,
    fileInputRef,
    handleFilesSelected,
    uploading,
    attachments,
    attachmentError,
    handleRemoveAttachment,
  } = form;

  return (
    <Card padding="lg">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight leading-snug">
            Describe the scope in detail.
          </h2>
          <p className="text-sm text-ink-muted mt-3 leading-relaxed max-w-sm">
            Cover the atmosphere, guest count, and any technical or equipment expectations. The more
            context you give, the more accurate the proposals you&apos;ll receive.
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
              Attach briefs, mood boards or floor plans so providers have full context. JPEG, PNG,
              WebP or PDF, up to {MAX_ATTACHMENTS} files. Only providers signed in and viewing your
              published requirement can open them.
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
  );
}
