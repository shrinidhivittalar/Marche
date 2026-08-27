import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoriesRepository } from '../repositories/categories.repository';
import { assertAdminRole } from '../marketplace-access.util';
import type { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';
import type { Category, PlatformRole } from '@marche/db';

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  getTree() {
    return this.categoriesRepository.findTree();
  }

  async getBySlug(slug: string) {
    const category = await this.categoriesRepository.findBySlug(slug);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async create(platformRole: PlatformRole, dto: CreateCategoryDto): Promise<Category> {
    assertAdminRole(platformRole);
    await this.assertSlugAvailable(dto.slug);
    if (dto.parentId) {
      await this.assertCanBeParent(dto.parentId);
    }

    return this.categoriesRepository.create({
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      icon: dto.icon,
      parentId: dto.parentId,
      displayOrder: dto.displayOrder ?? 0,
    });
  }

  async update(platformRole: PlatformRole, id: string, dto: UpdateCategoryDto): Promise<Category> {
    assertAdminRole(platformRole);
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (dto.slug && dto.slug !== category.slug) {
      await this.assertSlugAvailable(dto.slug);
    }

    if (dto.parentId !== undefined && dto.parentId !== category.parentId) {
      await this.assertReparentIsLegal(id, dto.parentId);
    }

    return this.categoriesRepository.update(id, {
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      icon: dto.icon,
      displayOrder: dto.displayOrder,
      // Prisma relation update: null detaches, undefined leaves untouched.
      ...(dto.parentId !== undefined
        ? { parent: dto.parentId ? { connect: { id: dto.parentId } } : { disconnect: true } }
        : {}),
    });
  }

  async remove(platformRole: PlatformRole, id: string): Promise<void> {
    assertAdminRole(platformRole);
    const category = await this.categoriesRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Counted up front rather than caught after the fact. Both underlying
    // foreign keys are RESTRICT, and Prisma surfaces those violations as an
    // unmapped PrismaClientUnknownRequestError with no error code — there
    // is no reliable way to catch one and turn it into a 409, so attempting
    // the delete first would produce a 500. Verified against the database.
    const [children, services] = await Promise.all([
      this.categoriesRepository.countChildren(id),
      this.categoriesRepository.countServices(id),
    ]);

    if (children > 0) {
      throw new ConflictException(
        `Cannot delete a category with ${children} subcategor${children === 1 ? 'y' : 'ies'}. Move or remove them first.`,
      );
    }
    if (services > 0) {
      throw new ConflictException(
        `Cannot delete a category with ${services} service${services === 1 ? '' : 's'}. Move or remove them first.`,
      );
    }

    await this.categoriesRepository.softDelete(id);
  }

  // Resolves a category slug to itself plus its children, so filtering by a
  // parent finds services filed under its children. Returns null for an
  // unknown slug and lets the caller decide how to report it.
  async resolveFilterIds(slug: string): Promise<string[] | null> {
    const category = await this.categoriesRepository.findBySlug(slug);
    if (!category) return null;
    return this.categoriesRepository.findSelfAndChildIds(category.id);
  }

  // Checks against soft-deleted rows too: the slug column is uniquely
  // indexed regardless of deletedAt, so reusing one would fail at the
  // database with an opaque error instead of this message.
  private async assertSlugAvailable(slug: string): Promise<void> {
    const existing = await this.categoriesRepository.findBySlugIncludingDeleted(slug);
    if (existing) {
      throw new ConflictException(`The slug "${slug}" is already in use`);
    }
  }

  private async assertCanBeParent(parentId: string): Promise<void> {
    const parent = await this.categoriesRepository.findById(parentId);
    if (!parent) {
      throw new BadRequestException('Parent category not found');
    }
    if (parent.parentId) {
      throw new BadRequestException(
        'Categories nest one level deep. A subcategory cannot itself have subcategories.',
      );
    }
  }

  private async assertReparentIsLegal(id: string, parentId: string | undefined): Promise<void> {
    if (!parentId) return; // promoting to top level is always fine

    // A self-parent is trivially reachable through this endpoint and would
    // make tree traversal loop forever.
    if (parentId === id) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    await this.assertCanBeParent(parentId);

    // Moving a category that has children under a parent would create a
    // third level by the back door — the depth rule has to be enforced from
    // both directions.
    const children = await this.categoriesRepository.countChildren(id);
    if (children > 0) {
      throw new BadRequestException(
        'This category has subcategories, so it cannot become a subcategory itself.',
      );
    }
  }
}
