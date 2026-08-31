import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoriesRepository } from '../repositories/categories.repository';
import {
  CategoryTemplatesRepository,
  type CreateFieldInput,
} from '../repositories/category-templates.repository';
import { assertAdminRole } from '../marketplace-access.util';
import type { CreateCategoryTemplateDto } from '../dto/category-template.dto';
import type { CategoryTemplateFieldType, PlatformRole, Prisma } from '@marche/db';

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

    return this.categoryTemplatesRepository.createAndActivate(categoryId, userId, fields);
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
