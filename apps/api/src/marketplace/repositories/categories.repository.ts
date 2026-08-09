import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Category, Prisma } from '@marche/db';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Full two-level tree in one query. Categories are a small, seeded set
  // (25 rows today), so this is not paginated — the browse UI wants the
  // whole tree at once to render its nav.
  findTree() {
    return this.prisma.client.category.findMany({
      where: { parentId: null, deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        children: {
          where: { deletedAt: null },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
  }

  findById(id: string) {
    return this.prisma.client.category.findFirst({ where: { id, deletedAt: null } });
  }

  findBySlug(slug: string) {
    return this.prisma.client.category.findFirst({
      where: { slug, deletedAt: null },
      include: { children: { where: { deletedAt: null }, select: { id: true } } },
    });
  }

  // Slug uniqueness is enforced by the DB, but checking first lets the
  // service return a clear 409 instead of surfacing a raw P2002.
  findBySlugIncludingDeleted(slug: string) {
    return this.prisma.client.category.findUnique({ where: { slug } });
  }

  // A category filter must match the category itself plus its children —
  // filtering "Photography & Video" and getting nothing because every
  // service sits under "Event Photography" would read as broken.
  async findSelfAndChildIds(id: string): Promise<string[]> {
    const children = await this.prisma.client.category.findMany({
      where: { parentId: id, deletedAt: null },
      select: { id: true },
    });
    return [id, ...children.map((c: { id: string }) => c.id)];
  }

  create(data: Prisma.CategoryUncheckedCreateInput): Promise<Category> {
    return this.prisma.client.category.create({ data });
  }

  update(id: string, data: Prisma.CategoryUpdateInput): Promise<Category> {
    return this.prisma.client.category.update({ where: { id }, data });
  }

  // Counts backing the pre-delete checks. These are not belt-and-braces:
  // both underlying foreign keys are RESTRICT, and Prisma surfaces those
  // violations as an *unmapped* PrismaClientUnknownRequestError with no
  // error code — so catching the DB error to produce a 409 is not possible
  // in any reliable way. The service must count first and refuse.
  countChildren(id: string) {
    return this.prisma.client.category.count({ where: { parentId: id, deletedAt: null } });
  }

  countServices(id: string) {
    return this.prisma.client.service.count({ where: { categoryId: id, deletedAt: null } });
  }

  softDelete(id: string): Promise<Category> {
    return this.prisma.client.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
