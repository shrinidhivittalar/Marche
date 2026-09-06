import { Card, Input } from '@marche/ui';
import { RephraseWithAiButton } from './RephraseWithAiButton';
import { MIN_TITLE, TITLE_EXAMPLES } from './useCreateJobForm';
import type { CreateJobForm } from './useCreateJobForm';

export function Step2Title({ form }: { form: CreateJobForm }) {
  const { title, setTitle, showTitleError, rephrasing, handleAiRephraseClick, selectedCategory } =
    form;

  return (
    <Card padding="lg">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight leading-snug">
            Let&apos;s start with a strong title.
          </h2>
          <p className="text-sm text-ink-muted mt-3 leading-relaxed max-w-sm">
            This is the first thing talent sees, so make it count. Be specific about the role and
            the occasion.
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
  );
}
