import {
  Card,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@marche/ui';
import { CategoryRequirementsFields } from '../CategoryRequirementsFields';
import type { CreateJobForm } from './useCreateJobForm';

export function Step1Category({ form }: { form: CreateJobForm }) {
  const {
    categories,
    categoryId,
    handleSelectCategory,
    templateResource,
    activeTemplate,
    selectedCategory,
  } = form;

  return (
    <Card padding="lg">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight leading-snug">
            What kind of service do you need?
          </h2>
          <p className="text-sm text-ink-muted mt-3 leading-relaxed max-w-sm">
            Pick the category that best fits your event. This routes your requirement to the right
            verified talent.
          </p>
        </div>

        <div>
          {categories.loading && <p className="text-xs text-ink-muted">Loading categories…</p>}
          {categories.error && (
            <p className="text-xs text-destructive" data-testid="categories-error">
              Categories could not be loaded. {categories.error}
            </p>
          )}
          {!categories.loading && !categories.error && (
            <Select value={categoryId || undefined} onValueChange={handleSelectCategory}>
              <SelectTrigger data-testid="category-select" aria-label="Category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {(categories.data ?? []).map((cat) =>
                  // Standalone categories (Photography, Painting, Electrical
                  // Work — no children) are directly selectable. A parent
                  // with children (the six-branch discovery taxonomy) is a
                  // group heading only, never itself a valid target —
                  // children are what services actually attach to (see
                  // seed.ts's own comment on CATEGORIES), so only they're
                  // selectable within the group.
                  cat.children && cat.children.length > 0 ? (
                    <SelectGroup key={cat.id}>
                      <SelectLabel>{cat.name}</SelectLabel>
                      {cat.children.map((child) => (
                        <SelectItem
                          key={child.id}
                          value={child.id}
                          data-testid={`category-${child.slug}`}
                        >
                          {child.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : (
                    <SelectItem key={cat.id} value={cat.id} data-testid={`category-${cat.slug}`}>
                      {cat.name}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          )}
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
                values={form.categoryData}
                onChange={(key, value) =>
                  form.setCategoryData((prev) => ({ ...prev, [key]: value }))
                }
                showErrors={form.attemptedNext}
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
  );
}
