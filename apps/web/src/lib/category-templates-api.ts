// Client for CategoryTemplate — beside disputes-api.ts for the same reason
// as always: one hand-written client per backend module, thin wrappers over
// the shared apiFetch<T>().
//
// A template version is immutable and never updated in place — "changing"
// one always means POSTing a brand new version, which the backend also
// activates atomically. There is no PATCH/DELETE here because none exists
// on the backend.
import { apiFetch } from './api-fetch';

export type CategoryTemplateFieldType =
  'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT' | 'MULTI_SELECT' | 'DATE';
export type ServiceMode = 'ONSITE' | 'REMOTE' | 'HYBRID';

// The admin shape (category-templates.repository.ts's TEMPLATE_FIELDS) —
// every field carries its own `id` and the template carries `createdAt`,
// neither of which the public shape exposes.
export interface ApiCategoryTemplateField {
  id: string;
  key: string;
  label: string;
  type: CategoryTemplateFieldType;
  required: boolean;
  order: number;
  options: string[] | null;
  validation: Record<string, unknown> | null;
}

export interface ApiCategoryTemplate {
  id: string;
  createdAt: string;
  allowedModes: ServiceMode[];
  locationRequired: boolean;
  fields: ApiCategoryTemplateField[];
}

// The public shape (category-templates.service.ts's PublicTemplate) —
// fields have no `id`, and the template has no `createdAt`.
export interface PublicCategoryTemplateField {
  key: string;
  label: string;
  type: CategoryTemplateFieldType;
  required: boolean;
  order: number;
  options: string[] | null;
  validation: Record<string, unknown> | null;
}

export interface PublicCategoryTemplate {
  id: string;
  allowedModes: ServiceMode[];
  locationRequired: boolean;
  fields: PublicCategoryTemplateField[];
}

export interface CreateCategoryTemplateFieldInput {
  key: string;
  label: string;
  type: CategoryTemplateFieldType;
  required?: boolean;
  order?: number;
  options?: string[];
  validation?: Record<string, unknown>;
}

export interface CreateCategoryTemplateInput {
  fields: CreateCategoryTemplateFieldInput[];
  allowedModes?: ServiceMode[];
  locationRequired?: boolean;
}

// A starting point, not a saved template — the backend already assigns a
// valid, deduplicated key and order to each suggestion (see
// ai.service.ts's sanitizeSuggestedTemplate), so this matches
// CreateCategoryTemplateFieldInput minus the parts a fresh suggestion never
// carries.
export interface SuggestedCategoryTemplateField {
  key: string;
  label: string;
  type: CategoryTemplateFieldType;
  required: boolean;
  order: number;
  options?: string[];
  validation?: Record<string, unknown>;
}

export interface SuggestedCategoryTemplate {
  allowedModes: ServiceMode[];
  locationRequired: boolean;
  fields: SuggestedCategoryTemplateField[];
}

export const categoryTemplatesApi = {
  // ---------- public ----------

  /** `{ template: null }` is a normal "nothing configured yet" state, not an error. */
  getActive: (slug: string) =>
    apiFetch<{ template: PublicCategoryTemplate | null }>(`/categories/${slug}/template`, null),

  getVersionPublic: (slug: string, templateId: string) =>
    apiFetch<{ template: PublicCategoryTemplate }>(
      `/categories/${slug}/template/${templateId}`,
      null,
    ),

  // ---------- admin ----------

  /** Full version history for a category, newest first. */
  listVersions: (token: string, categoryId: string) =>
    apiFetch<ApiCategoryTemplate[]>(`/categories/${categoryId}/templates`, token),

  getVersion: (token: string, categoryId: string, templateId: string) =>
    apiFetch<ApiCategoryTemplate>(`/categories/${categoryId}/templates/${templateId}`, token),

  /** Creates a new immutable version and activates it — there is no draft/publish step. */
  create: (token: string, categoryId: string, dto: CreateCategoryTemplateInput) =>
    apiFetch<ApiCategoryTemplate>(`/categories/${categoryId}/templates`, token, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  /** Nothing is saved by this call — the response is meant for the field
   * editor to prefill, for the admin to review/edit before create() above
   * actually runs. */
  suggestFields: (token: string, categoryId: string) =>
    apiFetch<SuggestedCategoryTemplate>(
      `/categories/${categoryId}/templates/suggest-fields`,
      token,
      {
        method: 'POST',
      },
    ),
};
