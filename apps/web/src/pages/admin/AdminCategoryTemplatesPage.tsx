import React, { useState } from 'react';
import { ListChecks, Plus, ChevronRight } from 'lucide-react';
import { Button, Card, Badge, Checkbox, Label } from '@marche/ui';
import { useApp } from '../../context/AppContext';
import { useApiResource } from '../../hooks/useApiResource';
import { ApiError } from '../../lib/api';
import { marketplaceApi, type ApiCategory } from '../../lib/marketplace-api';
import {
  categoryTemplatesApi,
  type ApiCategoryTemplate,
  type ServiceMode,
} from '../../lib/category-templates-api';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import {
  TemplateFieldEditor,
  emptyField,
  validateFields,
  type EditableField,
} from './TemplateFieldEditor';

const SERVICE_MODES: ServiceMode[] = ['ONSITE', 'REMOTE', 'HYBRID'];
const OPTIONS_TYPES = ['SELECT', 'MULTI_SELECT'];

function flattenCategories(categories: ApiCategory[]): ApiCategory[] {
  const result: ApiCategory[] = [];
  for (const category of categories) {
    result.push(category);
    if (category.children) result.push(...flattenCategories(category.children));
  }
  return result;
}

function toEditableFields(fields: ApiCategoryTemplate['fields']): EditableField[] {
  return [...fields]
    .sort((a, b) => a.order - b.order)
    .map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options ?? [],
      validation: (field.validation ?? {}) as EditableField['validation'],
    }));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Picker shown at /admin/categories (no id yet) — there is no separate
// category-list admin screen, so this doubles as the entry point into the
// one page /admin/categories/:id.
const CategoryPicker: React.FC<{ categories: ApiCategory[] }> = ({ categories }) => {
  const { navigate } = useApp();
  const flat = flattenCategories(categories);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
          Category Templates
        </h1>
        <p className="text-xs text-ink-muted mt-1">
          Pick a category to review or create a requirement-form version for it.
        </p>
      </div>

      {flat.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Categories are created elsewhere — there's nothing to configure a template for yet."
          icon={ListChecks}
        />
      ) : (
        <div className="space-y-2">
          {flat.map((category) => (
            <Card
              key={category.id}
              hoverable
              className="p-4 flex items-center justify-between cursor-pointer"
              onClick={() => navigate(`/admin/categories/${category.id}`)}
            >
              <div>
                <p className="text-sm font-bold text-ink">{category.name}</p>
                <p className="text-[11px] text-ink-muted font-mono">{category.slug}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

interface AdminCategoryTemplatesPageProps {
  id?: string;
}

export const AdminCategoryTemplatesPage: React.FC<AdminCategoryTemplatesPageProps> = ({ id }) => {
  const { accessToken } = useApp();
  const token = accessToken as string;

  const categories = useApiResource(() => marketplaceApi.categories(), []);

  if (!id) {
    if (categories.loading) {
      return <p className="text-xs text-ink-muted py-12 text-center">Loading categories…</p>;
    }
    if (categories.error) {
      return <p className="text-xs text-destructive py-12 text-center">{categories.error}</p>;
    }
    return <CategoryPicker categories={categories.data ?? []} />;
  }

  return <CategoryDetail id={id} token={token} categories={categories} />;
};

const CategoryDetail: React.FC<{
  id: string;
  token: string;
  categories: ReturnType<typeof useApiResource<ApiCategory[]>>;
}> = ({ id, token, categories }) => {
  const { navigate } = useApp();
  const category = (categories.data ?? []).length
    ? flattenCategories(categories.data ?? []).find((c) => c.id === id)
    : undefined;

  const history = useApiResource(() => categoryTemplatesApi.listVersions(token, id), [token, id], {
    enabled: Boolean(token),
  });

  const active = useApiResource(
    () =>
      category
        ? categoryTemplatesApi.getActive(category.slug)
        : Promise.resolve({ template: null }),
    [category?.slug],
    { enabled: Boolean(category) },
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editableFields, setEditableFields] = useState<EditableField[]>([]);
  const [allowedModes, setAllowedModes] = useState<ServiceMode[]>([]);
  const [locationRequired, setLocationRequired] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  const activeTemplateId = active.data?.template?.id ?? null;

  // Fetches the active version directly by id rather than searching for it
  // inside `history.data` — the two are separate requests, and cross
  // referencing them would silently fall back to an empty form if an active
  // template exists but, for any unexpected reason (a stale/short history
  // page, a request still in flight, a future change to how history is
  // fetched), isn't present in that array. Resolving it explicitly means a
  // genuine active template is either found and prefilled, or its absence
  // is a surfaced error — never a silent empty-form fallback.
  const openCreateModal = async () => {
    setSubmitError(null);
    setStatusMessage(null);
    setPrefillError(null);

    if (!activeTemplateId) {
      setEditableFields([emptyField()]);
      setAllowedModes([]);
      setLocationRequired(false);
      setCreateOpen(true);
      return;
    }

    setPrefillLoading(true);
    try {
      const activeFull = await categoryTemplatesApi.getVersion(token, id, activeTemplateId);
      setEditableFields(toEditableFields(activeFull.fields));
      setAllowedModes(activeFull.allowedModes);
      setLocationRequired(activeFull.locationRequired);
      setCreateOpen(true);
    } catch (error) {
      setPrefillError(
        error instanceof ApiError
          ? error.message
          : "Couldn't load the active template to prefill from. Try again.",
      );
    } finally {
      setPrefillLoading(false);
    }
  };

  // Single-select: picking a mode replaces whatever was selected, and
  // picking the already-selected one clears it back to "no restriction
  // configured" (empty array), matching the copy right below the buttons.
  // allowedModes stays a ServiceMode[] on the wire either way — the backend
  // contract is unchanged, this only constrains what the admin UI can send.
  const toggleMode = (mode: ServiceMode) => {
    setAllowedModes((prev) => (prev.length === 1 && prev[0] === mode ? [] : [mode]));
  };

  const fieldErrors = validateFields(editableFields);
  const canSubmit = editableFields.length > 0 && fieldErrors.every((e) => e === null);

  const handleCreate = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await categoryTemplatesApi.create(token, id, {
        fields: editableFields.map((field, index) => ({
          key: field.key.trim(),
          label: field.label.trim(),
          type: field.type,
          required: field.required,
          order: index,
          options: OPTIONS_TYPES.includes(field.type)
            ? field.options.map((o) => o.trim())
            : undefined,
          validation: Object.keys(field.validation).length > 0 ? field.validation : undefined,
        })),
        allowedModes,
        locationRequired,
      });
      setCreateOpen(false);
      await Promise.all([history.refetch(), active.refetch()]);
      setStatusMessage('New version created and activated.');
    } catch (error) {
      setSubmitError(
        error instanceof ApiError ? error.message : 'Unable to create the new version.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (categories.loading && !category) {
    return <p className="text-xs text-ink-muted py-12 text-center">Loading category…</p>;
  }
  if (!category) {
    return (
      <div className="max-w-3xl mx-auto">
        <EmptyState
          title="Category not found"
          description="This category doesn't exist, or was removed."
          icon={ListChecks}
          actionLabel="Back to categories"
          onAction={() => navigate('/admin/categories')}
        />
      </div>
    );
  }

  const versions = history.data ?? [];
  const versionNumber = (versionIndex: number) => versions.length - versionIndex;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="pb-6 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => navigate('/admin/categories')}
            className="text-[11px] text-ink-muted hover:text-ink mb-1 cursor-pointer"
          >
            ← All categories
          </button>
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
            {category.name}
          </h1>
          <p className="text-xs text-ink-muted mt-1 font-mono">{category.slug}</p>
        </div>
        <Button
          icon={Plus}
          onClick={() => void openCreateModal()}
          disabled={prefillLoading}
          loading={prefillLoading}
        >
          Create New Version
        </Button>
      </div>

      {statusMessage && <p className="text-xs text-primary font-semibold">{statusMessage}</p>}
      {prefillError && <p className="text-xs text-destructive font-semibold">{prefillError}</p>}

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Template versions</h2>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Every version is immutable once created. Jobs stay pinned to whichever version was
            active when they were created — activating a new version never changes them.
          </p>
        </div>

        {history.loading ? (
          <p className="text-xs text-ink-muted py-8 text-center">Loading template versions…</p>
        ) : history.error ? (
          <p className="text-xs text-destructive py-8 text-center">{history.error}</p>
        ) : versions.length === 0 ? (
          <EmptyState
            title="No template configured yet"
            description="This category has no requirement-form template. Create the first version to add one."
            icon={ListChecks}
          />
        ) : (
          <div className="space-y-3">
            {versions.map((template, index) => (
              <Card key={template.id} className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink">v{versionNumber(index)}</span>
                    {template.id === activeTemplateId && <Badge variant="success">Active</Badge>}
                  </div>
                  <span className="text-[11px] text-ink-muted">
                    Created {formatDate(template.createdAt)}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {template.allowedModes.length === 0 ? (
                    <Badge variant="neutral">Any service mode</Badge>
                  ) : (
                    template.allowedModes.map((mode) => (
                      <Badge key={mode} variant="info">
                        {mode}
                      </Badge>
                    ))
                  )}
                  {template.locationRequired && <Badge variant="warning">Location required</Badge>}
                </div>

                <div className="text-[11px] text-ink-muted">
                  {template.fields.length} field{template.fields.length === 1 ? '' : 's'}:{' '}
                  {template.fields
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((f) => f.label)
                    .join(', ')}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Version"
        description="This creates and activates a new immutable version. The version it replaces is left exactly as it was, and existing Jobs stay pinned to it."
        maxWidth="2xl"
      >
        <div className="space-y-6 pt-2">
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-ink">Template settings</h3>
            <div className="space-y-2">
              <Label className="text-[11px]">Service modes</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {SERVICE_MODES.map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={allowedModes.includes(mode) ? 'primary' : 'outline'}
                    onClick={() => toggleMode(mode)}
                  >
                    {mode}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-ink-muted">
                No selection means any service mode is allowed.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="location-required"
                checked={locationRequired}
                onCheckedChange={(checked) => setLocationRequired(checked === true)}
              />
              <Label htmlFor="location-required" className="text-xs">
                Location required
              </Label>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-ink">Fields</h3>
            <TemplateFieldEditor fields={editableFields} onChange={setEditableFields} />
          </div>

          {submitError && <p className="text-destructive text-xs font-medium">{submitError}</p>}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={submitting || !canSubmit}
              loading={submitting}
            >
              Create &amp; Activate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
