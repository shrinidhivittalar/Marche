import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CategoryTemplateFieldType, Prisma } from '@marche/db';

// What a template's fields look like on every read — public and admin
// alike. Declared once so the public active-template read and the admin
// history/detail reads cannot drift apart.
const FIELD_FIELDS = {
  id: true,
  key: true,
  label: true,
  type: true,
  required: true,
  order: true,
  options: true,
  validation: true,
} satisfies Prisma.CategoryTemplateFieldSelect;

// The template shape every read returns — id, when it was created, and its
// ordered fields. Deliberately excludes createdByUserId: that is an
// internal audit trail, not something a public or admin API response needs
// to name a user by id. (An admin listing could join it in later if a real
// need appears; nothing today asks for it.)
const TEMPLATE_FIELDS = {
  id: true,
  createdAt: true,
  fields: {
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: FIELD_FIELDS,
  },
} satisfies Prisma.CategoryTemplateSelect;

export interface CreateFieldInput {
  key: string;
  label: string;
  type: CategoryTemplateFieldType;
  required: boolean;
  order: number;
  options?: Prisma.InputJsonValue;
  validation?: Prisma.InputJsonValue;
}

@Injectable()
export class CategoryTemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.client.categoryTemplate.findUnique({
      where: { id },
      select: TEMPLATE_FIELDS,
    });
  }

  // Scoped by categoryId at the query level, not just existence — a
  // template id paired with the wrong category in the path must 404,
  // the same reasoning ProposalsService.findForJob already applies to
  // proposals (checked against the requirement in the path, not merely
  // ownership of some requirement).
  findByIdForCategory(categoryId: string, id: string) {
    return this.prisma.client.categoryTemplate.findFirst({
      where: { id, categoryId },
      select: TEMPLATE_FIELDS,
    });
  }

  // Every version ever created for a category, newest first — the version
  // history an admin reviews. Nothing here is ever deleted, so this list
  // only ever grows.
  listByCategory(categoryId: string) {
    return this.prisma.client.categoryTemplate.findMany({
      where: { categoryId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: TEMPLATE_FIELDS,
    });
  }

  // Resolves through Category.activeCategoryTemplateId rather than "most
  // recently created for this category" — the two are usually the same
  // value, but the pointer is the actual definition of "active" and the
  // one place that must never drift from it.
  findActiveForCategory(categoryId: string) {
    return this.prisma.client.category
      .findFirst({
        where: { id: categoryId, deletedAt: null },
        select: { activeCategoryTemplate: { select: TEMPLATE_FIELDS } },
      })
      .then((category) => category?.activeCategoryTemplate ?? null);
  }

  findActiveForCategoryBySlug(slug: string) {
    return this.prisma.client.category
      .findFirst({
        where: { slug, deletedAt: null },
        select: { activeCategoryTemplate: { select: TEMPLATE_FIELDS } },
      })
      .then((category) => category?.activeCategoryTemplate ?? null);
  }

  /**
   * Creates a new immutable version and activates it, atomically.
   *
   * The whole point of the transaction: a template that exists but is not
   * yet the category's active one (or the reverse — a pointer update that
   * landed without its target ever committing) is a state nothing in this
   * feature is designed to handle. Either both writes land or neither does.
   */
  async createAndActivate(categoryId: string, createdByUserId: string, fields: CreateFieldInput[]) {
    const templateId = await this.prisma.client.$transaction(async (tx) => {
      const template = await tx.categoryTemplate.create({
        data: {
          categoryId,
          createdByUserId,
          fields: { create: fields },
        },
      });

      await tx.category.update({
        where: { id: categoryId },
        data: { activeCategoryTemplateId: template.id },
      });

      return template.id;
    });

    // Re-read through the same shaped select every other read uses, rather
    // than hand-assembling the response from the pieces just written —
    // one definition of "what a template looks like", not two.
    return this.findById(templateId);
  }
}
