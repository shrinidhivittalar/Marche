import React, { useState } from 'react';
import { ListChecks, Plus, ChevronRight, Pencil, Sparkles } from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Checkbox,
  Label,
  Alert,
  Input,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@marche/ui';
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
import SpecularButton, { ADMIN_SPECULAR_PROPS } from '../../components/admin/SpecularButton';
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
      // Prefilled from an already-saved version — its key is real and
      // must never be regenerated from later label edits, unlike a field
      // added fresh this session.
      keyLocked: true,
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

// Matches the backend's own slug pattern (CreateCategoryDto) by
// construction — lowercase words joined by single hyphens, nothing else
// survives.
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const NO_PARENT = '__none__';

// Picker shown at /admin/categories (no id yet) — there is no separate
// category-list admin screen, so this doubles as the entry point into the
// one page /admin/categories/:id.
const CategoryPicker: React.FC<{
  token: string;
  categories: ReturnType<typeof useApiResource<ApiCategory[]>>;
}> = ({ token, categories }) => {
  const { navigate } = useApp();
  // Same reasoning as CategoryDetail's own pageEl — the Modal/Select below
  // portal to document.body by default, outside this page's
  // [data-theme="admin"] scope, and would otherwise render unthemed.
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  const flat = flattenCategories(categories.data ?? []);
  // The backend nests one level deep (assertCanBeParent) — a category that
  // already has a parent can't itself be picked as one, so it's left out
  // rather than offering a choice that's guaranteed to 400.
  const topLevel = flat.filter((c) => !c.parentId);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState(NO_PARENT);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openCreateModal = () => {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setDescription('');
    setParentId(NO_PARENT);
    setSubmitError(null);
    setCreateOpen(true);
  };

  const updateName = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const updateSlug = (value: string) => {
    setSlugTouched(true);
    setSlug(value);
  };

  const canSubmit = name.trim().length >= 2 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);

  const handleCreate = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await marketplaceApi.createCategory(token, {
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
        parentId: parentId === NO_PARENT ? undefined : parentId,
      });
      setCreateOpen(false);
      // Refetch before navigating — the detail page resolves the category
      // from this same shared resource, and a stale list would show
      // "Category not found" for the one just created.
      await categories.refetch();
      navigate(`/admin/categories/${created.id}`);
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : 'Unable to create the category.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={setPageEl} className="space-y-8 max-w-3xl mx-auto">
      <div className="pb-6 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
            Category Templates
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Pick a category to review or create a requirement-form version for it.
          </p>
        </div>
        <Button icon={Plus} onClick={openCreateModal}>
          Create Category
        </Button>
      </div>

      {flat.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Create the first category to get started."
          icon={ListChecks}
          actionLabel="Create Category"
          onAction={openCreateModal}
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

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Category"
        description="Creates the category immediately — configure its requirement template and settings afterward."
        container={pageEl}
      >
        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Category Name</Label>
            <Input
              value={name}
              onChange={(e) => updateName(e.target.value)}
              placeholder="e.g. Wedding Photography"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Slug</Label>
            <Input
              value={slug}
              onChange={(e) => updateSlug(e.target.value)}
              placeholder="wedding-photography"
              className="font-mono"
            />
            <p className="text-[11px] text-ink-muted">
              Lowercase, hyphen-separated. Auto-filled from the name until edited directly.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Description (optional)</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown to clients when browsing categories."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Parent category (optional)</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={pageEl}>
                <SelectItem value={NO_PARENT}>No parent — top-level category</SelectItem>
                {topLevel.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-ink-muted">
              Categories nest one level deep — a subcategory can't itself have subcategories.
            </p>
          </div>

          {submitError && <Alert variant="destructive" title={submitError} />}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={submitting || !canSubmit}
              loading={submitting}
            >
              Create Category
            </Button>
          </div>
        </div>
      </Modal>
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
    return <CategoryPicker token={token} categories={categories} />;
  }

  return <CategoryDetail id={id} token={token} categories={categories} />;
};

const CategoryDetail: React.FC<{
  id: string;
  token: string;
  categories: ReturnType<typeof useApiResource<ApiCategory[]>>;
}> = ({ id, token, categories }) => {
  const { navigate } = useApp();
  // The modal (and its own Select dropdowns) portal to document.body by
  // default, which sits outside this page's [data-theme="admin"] scope —
  // see Dialog.tsx/Select.tsx's own comments on `container`. Passing this
  // node keeps portaled content themed correctly instead of rendering red.
  // State rather than a plain ref: reading ref.current directly during
  // render is unsafe (it can be stale on the commit that first attaches
  // it), so the DOM node is captured via a callback ref into state instead,
  // which is safe to read during render and triggers the re-render the
  // Modal/TemplateFieldEditor below need once it's actually attached.
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
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
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // Rename / edit description — deliberately separate from the template
  // version state above: this edits the Category row itself (PATCH
  // /categories/:id), not a CategoryTemplate version. Slug is not editable
  // here — out of scope, and every existing link/route to this category
  // already uses its id, not its slug, so nothing downstream breaks by
  // leaving it out.
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  // Replaces whatever is currently in the editor with the suggestion —
  // same "review before it's real" relationship CreateJobPage's AI prompt
  // flow has to the manual form: nothing is saved here, canSubmit still
  // gates on the same validateFields check a hand-built version does, and
  // every suggested field can be edited or removed before Create Version
  // actually runs.
  const handleSuggestFields = async () => {
    setSuggestError(null);
    setSuggesting(true);
    try {
      const suggested = await categoryTemplatesApi.suggestFields(token, id);
      setEditableFields(
        suggested.fields.length > 0
          ? suggested.fields.map((field) => ({
              key: field.key,
              keyLocked: false,
              label: field.label,
              type: field.type,
              required: field.required,
              options: field.options ?? [],
              validation: (field.validation ?? {}) as EditableField['validation'],
            }))
          : [emptyField()],
      );
      setAllowedModes(suggested.allowedModes);
      setLocationRequired(suggested.locationRequired);
    } catch (error) {
      setSuggestError(
        error instanceof ApiError ? error.message : "Couldn't get AI suggestions. Try again.",
      );
    } finally {
      setSuggesting(false);
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

  const openEditModal = () => {
    if (!category) return;
    setEditName(category.name);
    setEditDescription(category.description ?? '');
    setEditError(null);
    setEditDetailsOpen(true);
  };

  const canSubmitEdit = editName.trim().length >= 2;

  const handleEditSave = async () => {
    if (!canSubmitEdit) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await marketplaceApi.updateCategory(token, id, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      setEditDetailsOpen(false);
      await categories.refetch();
    } catch (error) {
      setEditError(error instanceof ApiError ? error.message : 'Unable to save changes.');
    } finally {
      setEditSubmitting(false);
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
    <div ref={setPageEl} className="space-y-8 max-w-4xl mx-auto">
      <div className="pb-6 border-b border-border flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => navigate('/admin/categories')}
            className="text-[11px] text-ink-muted hover:text-ink mb-1 cursor-pointer"
          >
            ← All categories
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
              {category.name}
            </h1>
            <button
              type="button"
              onClick={openEditModal}
              aria-label="Edit category name and description"
              className="text-ink-muted hover:text-ink cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-ink-muted mt-1 font-mono">{category.slug}</p>
          {category.description && (
            <p className="text-xs text-ink-muted mt-1 max-w-md">{category.description}</p>
          )}
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

      {statusMessage && <Alert variant="success" title={statusMessage} />}
      {prefillError && <Alert variant="destructive" title={prefillError} />}

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
        container={pageEl}
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
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold text-ink">Fields</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Sparkles}
                onClick={handleSuggestFields}
                disabled={suggesting}
              >
                {suggesting ? 'Suggesting…' : 'Suggest fields with AI'}
              </Button>
            </div>
            {suggestError && <Alert variant="destructive" title={suggestError} />}
            <TemplateFieldEditor
              fields={editableFields}
              onChange={setEditableFields}
              selectContainer={pageEl}
            />
          </div>

          {submitError && <Alert variant="destructive" title={submitError} />}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <SpecularButton
              {...ADMIN_SPECULAR_PROPS}
              type="button"
              onClick={handleCreate}
              disabled={submitting || !canSubmit}
            >
              {submitting ? 'Creating…' : 'Create & Activate'}
            </SpecularButton>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={editDetailsOpen}
        onClose={() => setEditDetailsOpen(false)}
        title="Edit Category"
        description="Slug is not editable here — it's referenced by existing links and routes."
        container={pageEl}
      >
        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Category Name</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Description (optional)</Label>
            <Textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Shown to clients when browsing categories."
            />
          </div>

          {editError && <Alert variant="destructive" title={editError} />}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setEditDetailsOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleEditSave()}
              disabled={editSubmitting || !canSubmitEdit}
              loading={editSubmitting}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
