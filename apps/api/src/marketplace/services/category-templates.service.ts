import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoriesRepository } from '../repositories/categories.repository';
import {
  CategoryTemplatesRepository,
  type CreateFieldInput,
} from '../repositories/category-templates.repository';
import { assertAdminRole } from '../marketplace-access.util';
import type { CreateCategoryTemplateDto } from '../dto/category-template.dto';
import type { CategoryTemplateFieldType, PlatformRole, Prisma, ServiceMode } from '@marche/db';

// The shape every read off CategoryTemplatesRepository returns — derived
// from the repository's own return type rather than hand-duplicated, so
// this can never drift from TEMPLATE_FIELDS.
type ResolvedTemplate = NonNullable<Awaited<ReturnType<CategoryTemplatesRepository['findById']>>>;
type ResolvedTemplateField = ResolvedTemplate['fields'][number];

const OPTIONS_TYPES: CategoryTemplateFieldType[] = ['SELECT', 'MULTI_SELECT'];
const VALIDATION_KEYS: Record<CategoryTemplateFieldType, string[]> = {
  NUMBER: ['min', 'max'],
  TEXT: ['minLength', 'maxLength'],
  BOOLEAN: [],
  SELECT: [],
  MULTI_SELECT: [],
  DATE: [],
};

@Injectable()
export class CategoryTemplatesService {
  constructor(
    private readonly categoryTemplatesRepository: CategoryTemplatesRepository,
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

  // ---------- public reads ----------

  /**
   * A category's active template, for rendering a requirement form. Clean
   * "nothing configured yet" response — `{ template: null }`, not a 404 —
   * rather than treating an unconfigured category as an error: it is a
   * normal, expected state throughout rollout, and no client of this route
   * should have to special-case an error status for it.
   */
  async getActiveForSlug(slug: string): Promise<{ template: PublicTemplate | null }> {
    const category = await this.categoriesRepository.findBySlug(slug);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const template = await this.categoryTemplatesRepository.findActiveForCategoryBySlug(slug);
    return { template: template ? toPublicTemplate(template) : null };
  }

  // ---------- admin ----------

  async listVersions(platformRole: PlatformRole, categoryId: string) {
    assertAdminRole(platformRole);
    await this.assertCategoryExists(categoryId);
    return this.categoryTemplatesRepository.listByCategory(categoryId);
  }

  async getVersion(platformRole: PlatformRole, categoryId: string, templateId: string) {
    assertAdminRole(platformRole);
    await this.assertCategoryExists(categoryId);

    // Scoped by categoryId at the query level, not merely existence —
    // without this, an admin could read any template by pairing its id
    // with a category they happen to be looking at, the same reasoning
    // ProposalsService.findForJob already applies to proposals.
    const template = await this.categoryTemplatesRepository.findByIdForCategory(
      categoryId,
      templateId,
    );
    if (!template) {
      throw new NotFoundException('Template version not found');
    }

    return template;
  }

  /**
   * Creates a new immutable version and activates it, in one transaction —
   * see CategoryTemplatesRepository.createAndActivate. There is no update
   * path: a "change" is always a new version, and the previous one is
   * never touched.
   */
  async createAndActivate(
    platformRole: PlatformRole,
    userId: string,
    categoryId: string,
    dto: CreateCategoryTemplateDto,
  ) {
    assertAdminRole(platformRole);
    await this.assertCategoryExists(categoryId);

    const keys = new Set<string>();
    const fields: CreateFieldInput[] = dto.fields.map((field, index) => {
      if (keys.has(field.key)) {
        throw new BadRequestException(`Duplicate field key "${field.key}"`);
      }
      keys.add(field.key);

      this.assertOptionsAppropriate(field.type, field.options);
      this.assertValidationAppropriate(field.type, field.validation);

      return {
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required ?? false,
        order: field.order ?? index,
        options: OPTIONS_TYPES.includes(field.type)
          ? (field.options as Prisma.InputJsonValue | undefined)
          : undefined,
        validation: field.validation as Prisma.InputJsonValue | undefined,
      };
    });

    return this.categoryTemplatesRepository.createAndActivate(
      categoryId,
      userId,
      fields,
      dto.allowedModes ?? [],
      dto.locationRequired ?? false,
    );
  }

  // ---------- template resolution + shared validation, used by Jobs and Direct Contracts ----------

  /**
   * The category's *current* active template — used only at the moment a
   * Job's template lock is (re)established: a brand-new Job, or an
   * existing one whose categoryId is changing. Never called to validate an
   * already-locked Job against "whatever is active now" — see
   * resolveLockedTemplate for that case, and Job.categoryTemplateId's own
   * schema comment for why the distinction matters.
   */
  async resolveActiveTemplate(categoryId: string): Promise<ResolvedTemplate | null> {
    return this.categoryTemplatesRepository.findActiveForCategory(categoryId);
  }

  /**
   * Re-reads a Job's own locked template version — the one that governs
   * it, permanently, regardless of what an admin has done to the category
   * since. Scoped by categoryId as a defence-in-depth check, the same
   * reasoning getVersion already applies to an admin-supplied id.
   *
   * Should never return null in practice: a template is immutable and
   * never deleted (CategoryTemplate's own comment), so a Job's own lock
   * pointing nowhere would mean data corruption, not a normal runtime
   * condition — hence a thrown Error rather than a caller-handleable
   * exception.
   */
  async resolveLockedTemplate(
    categoryId: string,
    categoryTemplateId: string,
  ): Promise<ResolvedTemplate> {
    const template = await this.categoryTemplatesRepository.findByIdForCategory(
      categoryId,
      categoryTemplateId,
    );
    if (!template) {
      throw new Error(
        `Job's locked template ${categoryTemplateId} not found for category ${categoryId}`,
      );
    }
    return template;
  }

  /**
   * The one place "does this serviceMode/locationCoarse/categoryData
   * satisfy this template" is decided. Called from both
   * JobsService.create/update and DirectContractsService.create — Direct
   * Contracts writes its Job directly rather than through JobsService, so
   * without a shared method this check would need to be written twice and
   * would drift the first time one of the two call sites changed.
   *
   * Takes an already-resolved template rather than a categoryId: the
   * caller has already decided, via resolveActiveTemplate or
   * resolveLockedTemplate, which version governs. A null template means a
   * category with nothing configured — left entirely unrestricted, the
   * same "not every category needs one on day one" tolerance the public
   * template read already applies. An empty `allowedModes` on a template
   * that *does* exist is read the same way: no restriction configured
   * yet, never "no mode is allowed" — see CategoryTemplate.allowedModes'
   * own schema comment for why the default has to mean this.
   *
   * Returns the categoryData to persist — null exactly when template is
   * null (nothing to answer against), otherwise a fully-checked object,
   * per Job.categoryData's own invariant.
   */
  assertJobRequirements(
    template: ResolvedTemplate | null,
    serviceMode: ServiceMode | null | undefined,
    locationCoarse: string | null | undefined,
    categoryData: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!template) {
      // categoryData only means something in the context of a template's
      // field definitions — supplying it for a category with none
      // configured is a caller mistake worth surfacing, not silently
      // discarded input. An absent/empty categoryData is fine: there is
      // nothing to answer.
      if (categoryData && Object.keys(categoryData).length > 0) {
        throw new BadRequestException(
          'categoryData was supplied, but this category has no requirement template to validate it against',
        );
      }
      return null;
    }

    if (
      serviceMode &&
      template.allowedModes.length > 0 &&
      !template.allowedModes.includes(serviceMode)
    ) {
      throw new BadRequestException(
        `serviceMode must be one of: ${template.allowedModes.join(', ')} for this category`,
      );
    }

    if (template.locationRequired && !locationCoarse) {
      throw new BadRequestException('locationCoarse is required for this category');
    }

    return this.assertCategoryData(template, categoryData);
  }

  // Every required field present, every supplied value the right shape for
  // its field's type, and no key that isn't one of the template's own
  // fields. Reuses the same type-appropriate checking
  // assertValidationAppropriate already applies to a field's *definition*
  // (min/max, minLength/maxLength, options membership), run here against a
  // Job's submitted *answer* instead.
  private assertCategoryData(
    template: ResolvedTemplate,
    categoryData: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    const data = categoryData ?? {};
    const fieldsByKey = new Map(template.fields.map((field) => [field.key, field]));

    for (const key of Object.keys(data)) {
      if (!fieldsByKey.has(key)) {
        throw new BadRequestException(
          `Unknown categoryData key "${key}" for this category's template`,
        );
      }
    }

    for (const field of template.fields) {
      const value = data[field.key];
      if (value === undefined || value === null) {
        if (field.required) {
          throw new BadRequestException(`categoryData.${field.key} ("${field.label}") is required`);
        }
        continue;
      }
      this.assertFieldValue(field, value);
    }

    return data;
  }

  private assertFieldValue(field: ResolvedTemplateField, value: unknown): void {
    switch (field.type) {
      case 'TEXT': {
        if (typeof value !== 'string') {
          throw new BadRequestException(`categoryData.${field.key} must be a string`);
        }
        const validation = (field.validation ?? {}) as { minLength?: number; maxLength?: number };
        if (typeof validation.minLength === 'number' && value.length < validation.minLength) {
          throw new BadRequestException(
            `categoryData.${field.key} must be at least ${validation.minLength} characters`,
          );
        }
        if (typeof validation.maxLength === 'number' && value.length > validation.maxLength) {
          throw new BadRequestException(
            `categoryData.${field.key} must be at most ${validation.maxLength} characters`,
          );
        }
        return;
      }
      case 'NUMBER': {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new BadRequestException(`categoryData.${field.key} must be a number`);
        }
        const validation = (field.validation ?? {}) as { min?: number; max?: number };
        if (typeof validation.min === 'number' && value < validation.min) {
          throw new BadRequestException(
            `categoryData.${field.key} must be at least ${validation.min}`,
          );
        }
        if (typeof validation.max === 'number' && value > validation.max) {
          throw new BadRequestException(
            `categoryData.${field.key} must be at most ${validation.max}`,
          );
        }
        return;
      }
      case 'BOOLEAN': {
        if (typeof value !== 'boolean') {
          throw new BadRequestException(`categoryData.${field.key} must be a boolean`);
        }
        return;
      }
      case 'DATE': {
        if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) {
          throw new BadRequestException(`categoryData.${field.key} must be a valid date`);
        }
        return;
      }
      case 'SELECT': {
        const options = (field.options as string[] | null) ?? [];
        if (typeof value !== 'string' || !options.includes(value)) {
          throw new BadRequestException(
            `categoryData.${field.key} must be one of: ${options.join(', ')}`,
          );
        }
        return;
      }
      case 'MULTI_SELECT': {
        const options = (field.options as string[] | null) ?? [];
        if (
          !Array.isArray(value) ||
          value.some((v) => typeof v !== 'string' || !options.includes(v))
        ) {
          throw new BadRequestException(
            `categoryData.${field.key} must be an array of: ${options.join(', ')}`,
          );
        }
        return;
      }
    }
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.categoriesRepository.findById(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }

  // `options` is meaningful for exactly two types, and this is where that
  // is judged — a single-property class-validator decorator on the DTO
  // cannot see the sibling `type` field to make this call itself.
  private assertOptionsAppropriate(type: CategoryTemplateFieldType, options?: string[]): void {
    if (OPTIONS_TYPES.includes(type)) {
      if (!options || options.length === 0) {
        throw new BadRequestException(`A ${type} field requires at least one option`);
      }
      const trimmed = options.map((o) => o.trim());
      if (trimmed.some((o) => o.length === 0)) {
        throw new BadRequestException('Options must not be empty or whitespace-only');
      }
      if (new Set(trimmed).size !== trimmed.length) {
        throw new BadRequestException('Options must not repeat');
      }
      return;
    }
    if (options !== undefined) {
      throw new BadRequestException(`options is not valid on a ${type} field`);
    }
  }

  // Deliberately small and closed: exactly the keys VALIDATION_KEYS names
  // for this type, each a non-negative finite number, nothing else. Not a
  // JSON-Schema document — see CategoryTemplateFieldType's own comment in
  // schema.prisma for why that is a boundary, not an oversight.
  private assertValidationAppropriate(
    type: CategoryTemplateFieldType,
    validation?: Record<string, unknown>,
  ): void {
    if (validation === undefined) return;

    const allowedKeys = VALIDATION_KEYS[type];
    if (allowedKeys.length === 0) {
      throw new BadRequestException(`validation is not valid on a ${type} field`);
    }

    const providedKeys = Object.keys(validation);
    const unknownKey = providedKeys.find((key) => !allowedKeys.includes(key));
    if (unknownKey) {
      throw new BadRequestException(
        `Unknown validation key "${unknownKey}" for a ${type} field. Allowed: ${allowedKeys.join(', ')}`,
      );
    }
    for (const key of providedKeys) {
      const value = validation[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new BadRequestException(`validation.${key} must be a non-negative number`);
      }
    }

    if (
      type === 'NUMBER' &&
      typeof validation.min === 'number' &&
      typeof validation.max === 'number' &&
      validation.max < validation.min
    ) {
      throw new BadRequestException(
        'validation.max must be greater than or equal to validation.min',
      );
    }
    if (
      type === 'TEXT' &&
      typeof validation.minLength === 'number' &&
      typeof validation.maxLength === 'number' &&
      validation.maxLength < validation.minLength
    ) {
      throw new BadRequestException(
        'validation.maxLength must be greater than or equal to validation.minLength',
      );
    }
  }
}

// The public shape — everything a frontend needs to render the form, and
// nothing an admin-only concern would add. createdByUserId (an internal
// audit trail) is already absent from the repository's own select, so
// there is nothing further to strip here; this type exists so that
// omission is a compile-time fact, not just a runtime one.
export interface PublicTemplate {
  id: string;
  allowedModes: ServiceMode[];
  locationRequired: boolean;
  fields: {
    key: string;
    label: string;
    type: CategoryTemplateFieldType;
    required: boolean;
    order: number;
    options: string[] | null;
    validation: Record<string, unknown> | null;
  }[];
}

function toPublicTemplate(template: {
  id: string;
  allowedModes: ServiceMode[];
  locationRequired: boolean;
  fields: {
    key: string;
    label: string;
    type: CategoryTemplateFieldType;
    required: boolean;
    order: number;
    options: unknown;
    validation: unknown;
  }[];
}): PublicTemplate {
  return {
    id: template.id,
    allowedModes: template.allowedModes,
    locationRequired: template.locationRequired,
    fields: template.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      order: f.order,
      options: (f.options as string[] | null) ?? null,
      validation: (f.validation as Record<string, unknown> | null) ?? null,
    })),
  };
}
