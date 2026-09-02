import React from 'react';
import { useApiResource } from '../../hooks/useApiResource';
import {
  categoryTemplatesApi,
  type PublicCategoryTemplateField,
} from '../../lib/category-templates-api';

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatValue(field: PublicCategoryTemplateField, value: unknown): React.ReactNode {
  switch (field.type) {
    case 'BOOLEAN':
      return value ? 'Yes' : 'No';
    case 'DATE':
      return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
        ? dateFormat.format(new Date(value))
        : null;
    case 'MULTI_SELECT': {
      const selected = Array.isArray(value)
        ? (value as unknown[]).filter((v) => typeof v === 'string')
        : [];
      if (selected.length === 0) return null;
      return (
        <ul className="space-y-1">
          {selected.map((option) => (
            <li key={option as string} className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-ink-muted shrink-0" />
              <span>{option as string}</span>
            </li>
          ))}
        </ul>
      );
    }
    case 'NUMBER':
      return typeof value === 'number' ? String(value) : null;
    case 'TEXT':
    case 'SELECT':
    default:
      return typeof value === 'string' && value.trim() ? value : null;
  }
}

interface CategoryRequirementsDisplayProps {
  categorySlug: string;
  categoryTemplateId: string | null;
  categoryData: Record<string, unknown> | null;
}

// Read-only counterpart to CategoryRequirementsFields (the answer *editor*)
// and TemplateFieldEditor (the admin's field *definition* editor) — this one
// only ever renders. Shared by both the client's own view and the provider's
// public view, so it lives in components/jobs rather than under either
// role's pages/ tree.
//
// Always resolves the Job's own locked version, by id — never the
// category's current active template. There is no code path here capable of
// calling categoryTemplatesApi.getActive; that is deliberate, not just
// convention, so a future edit to this file can't accidentally reintroduce
// "whatever is active now" as a Job's rendered answers.
export const CategoryRequirementsDisplay: React.FC<CategoryRequirementsDisplayProps> = ({
  categorySlug,
  categoryTemplateId,
  categoryData,
}) => {
  const template = useApiResource(
    () =>
      categoryTemplatesApi
        .getVersionPublic(categorySlug, categoryTemplateId as string)
        .then((res) => res.template),
    [categorySlug, categoryTemplateId],
    { enabled: Boolean(categoryTemplateId) },
  );

  // No template was ever locked to this Job — nothing to show, not an
  // empty state. Matches how "Expected Deliverables" only renders when
  // there are any.
  if (!categoryTemplateId) return null;

  if (template.loading) {
    return <p className="text-xs text-ink-muted">Loading requirements…</p>;
  }

  // Isolated from the rest of the page on purpose: a failure here (a
  // deleted category, a network blip) must not take down the requirement
  // itself, the same reasoning ProposalsOnRequirement's own request keeps
  // separate from the main job fetch.
  if (template.error || !template.data) {
    return <p className="text-xs text-destructive">Requirements unavailable.</p>;
  }

  const fields = [...template.data.fields].sort((a, b) => a.order - b.order);
  const data = categoryData ?? {};
  const rows = fields
    .map((field) => ({ field, display: formatValue(field, data[field.key]) }))
    .filter((row) => row.display !== null);

  if (rows.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-mono uppercase font-bold text-primary mb-3">
        Category Requirements
      </h3>
      <div className="space-y-3">
        {rows.map(({ field, display }) => (
          <div key={field.key} className="p-3 bg-bg border border-border rounded-xl text-xs">
            <span className="block text-[10px] font-mono uppercase text-ink-muted mb-1">
              {field.label}
            </span>
            <div className="text-ink font-medium">{display}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
