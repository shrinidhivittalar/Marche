import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CategoriesService } from '../services/categories.service';
import { CategoriesRepository } from '../repositories/categories.repository';

function mockRepo() {
  return {
    findTree: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    findBySlug: jest.fn().mockResolvedValue(null),
    findBySlugIncludingDeleted: jest.fn().mockResolvedValue(null),
    findSelfAndChildIds: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'new' }),
    update: jest.fn().mockResolvedValue({ id: 'updated' }),
    countChildren: jest.fn().mockResolvedValue(0),
    countServices: jest.fn().mockResolvedValue(0),
    softDelete: jest.fn().mockResolvedValue({ id: 'deleted' }),
  };
}

const TOP_LEVEL = { id: 'parent_1', slug: 'photography', parentId: null };
const CHILD = { id: 'child_1', slug: 'wedding', parentId: 'parent_1' };
const validDto = { name: 'Photography', slug: 'photography' };

describe('CategoriesService', () => {
  let repo: ReturnType<typeof mockRepo>;
  let service: CategoriesService;

  beforeEach(() => {
    repo = mockRepo();
    service = new CategoriesService(repo as unknown as CategoriesRepository);
  });

  describe('authorization', () => {
    it.each(['CLIENT', 'PROVIDER'])('rejects create by %s', async (role) => {
      await expect(service.create(role, validDto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects update by a non-admin', async () => {
      await expect(service.update('PROVIDER', 'c1', { name: 'x' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rejects delete by a non-admin', async () => {
      await expect(service.remove('PROVIDER', 'c1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it('allows an admin', async () => {
      await expect(service.create('ADMIN', validDto)).resolves.toEqual({ id: 'new' });
    });
  });

  describe('slug rules', () => {
    it('rejects a slug already in use', async () => {
      repo.findBySlugIncludingDeleted.mockResolvedValue({ id: 'existing' });
      await expect(service.create('ADMIN', validDto)).rejects.toBeInstanceOf(ConflictException);
    });

    // The unique index ignores deletedAt, so a soft-deleted row still owns
    // its slug — checking only live rows would produce an opaque DB error.
    it('treats a soft-deleted category as still holding its slug', async () => {
      repo.findBySlugIncludingDeleted.mockResolvedValue({ id: 'gone', deletedAt: new Date() });
      await expect(service.create('ADMIN', validDto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('hierarchy depth', () => {
    it('allows a child under a top-level category', async () => {
      repo.findById.mockResolvedValue(TOP_LEVEL);
      await expect(
        service.create('ADMIN', { ...validDto, slug: 'wedding', parentId: 'parent_1' }),
      ).resolves.toBeDefined();
    });

    it('rejects a third level', async () => {
      repo.findById.mockResolvedValue(CHILD);
      await expect(
        service.create('ADMIN', { ...validDto, slug: 'deep', parentId: 'child_1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown parent', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.create('ADMIN', { ...validDto, slug: 'orphan', parentId: 'nope' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a category becoming its own parent', async () => {
      repo.findById.mockResolvedValue(TOP_LEVEL);
      await expect(
        service.update('ADMIN', 'parent_1', { parentId: 'parent_1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // Depth has to be enforced from both ends: moving a populated parent
    // under another parent would create a third level by the back door.
    it('rejects reparenting a category that has children', async () => {
      repo.findById.mockResolvedValueOnce({ id: 'movable', slug: 's', parentId: null });
      repo.findById.mockResolvedValueOnce(TOP_LEVEL);
      repo.countChildren.mockResolvedValue(2);
      await expect(
        service.update('ADMIN', 'movable', { parentId: 'parent_1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows promoting a child to top level', async () => {
      repo.findById.mockResolvedValue(CHILD);
      await expect(
        service.update('ADMIN', 'child_1', { parentId: undefined }),
      ).resolves.toBeDefined();
    });
  });

  describe('delete blocking', () => {
    beforeEach(() => repo.findById.mockResolvedValue(TOP_LEVEL));

    it('refuses when subcategories exist', async () => {
      repo.countChildren.mockResolvedValue(3);
      await expect(service.remove('ADMIN', 'parent_1')).rejects.toThrow(/3 subcategories/);
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it('refuses when services exist', async () => {
      repo.countServices.mockResolvedValue(1);
      await expect(service.remove('ADMIN', 'parent_1')).rejects.toThrow(/1 service\b/);
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it('is a 409, not a 500 — the DB error cannot be caught reliably', async () => {
      repo.countServices.mockResolvedValue(1);
      await expect(service.remove('ADMIN', 'parent_1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('soft deletes when nothing blocks it', async () => {
      await service.remove('ADMIN', 'parent_1');
      expect(repo.softDelete).toHaveBeenCalledWith('parent_1');
    });

    it('404s on an unknown category', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.remove('ADMIN', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('filter resolution', () => {
    it('rolls a parent up with its children', async () => {
      repo.findBySlug.mockResolvedValue(TOP_LEVEL);
      repo.findSelfAndChildIds.mockResolvedValue(['parent_1', 'child_1']);
      await expect(service.resolveFilterIds('photography')).resolves.toEqual([
        'parent_1',
        'child_1',
      ]);
    });

    it('returns null for an unknown slug rather than throwing', async () => {
      await expect(service.resolveFilterIds('nope')).resolves.toBeNull();
    });
  });
});
