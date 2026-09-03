import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoryTemplatesService } from '../services/category-templates.service';
import { JobsService } from '../../jobs/services/jobs.service';
import { DirectContractsService } from '../../direct-contracts/services/direct-contracts.service';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';

/**
 * Template version locking + categoryData — Slice 4 of the
 * category-requirements-location work.
 *
 * Runs against the real database because the thing genuinely at risk is
 * exactly what a mock cannot prove: that a Job's categoryTemplateId, once
 * set, actually stays pointed at the version it was created under even
 * after an admin activates a newer one for the category — and that Jobs
 * and Direct Contracts, two independent write paths, both lock and
 * validate against it the same way, through the one shared
 * CategoryTemplatesService.assertJobRequirements call.
 *
 * Everything this file creates is prefixed `m-lock-` and deleted in
 * afterAll, including on failure.
 */

const RUN = `m-lock-${Date.now()}`;
const created = {
  userIds: [] as string[],
  profileIds: [] as string[],
  categoryIds: [] as string[],
  jobIds: [] as string[],
};

describe('template version locking + categoryData', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let templates: CategoryTemplatesService;
  let jobs: JobsService;
  let directContracts: DirectContractsService;

  let adminUserId: string;
  let clientUserId: string;
  let providerProfileId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 0,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();
    prisma = moduleRef.get(PrismaService);
    templates = moduleRef.get(CategoryTemplatesService);
    jobs = moduleRef.get(JobsService);
    directContracts = moduleRef.get(DirectContractsService);

    const admin = await prisma.client.user.create({
      data: {
        email: `${RUN}-admin@example.invalid`,
        passwordHash: 'integration-test-only',
        name: `${RUN} admin`,
        role: 'ADMIN',
        platformRole: 'ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
    adminUserId = admin.id;
    created.userIds.push(admin.id);

    const client = await prisma.client.user.create({
      data: {
        email: `${RUN}-client@example.invalid`,
        passwordHash: 'integration-test-only',
        name: `${RUN} client`,
        role: 'CLIENT',
        capabilities: { create: { capability: 'CLIENT' } },
        emailVerifiedAt: new Date(),
      },
    });
    clientUserId = client.id;
    created.userIds.push(client.id);
    const clientProfile = await prisma.client.profile.create({
      data: { userId: client.id, displayName: `${RUN} client` },
    });
    created.profileIds.push(clientProfile.id);

    const provider = await prisma.client.user.create({
      data: {
        email: `${RUN}-provider@example.invalid`,
        passwordHash: 'integration-test-only',
        name: `${RUN} provider`,
        role: 'PROVIDER',
        capabilities: { create: { capability: 'PROVIDER' } },
        emailVerifiedAt: new Date(),
      },
    });
    created.userIds.push(provider.id);
    const providerProfile = await prisma.client.profile.create({
      data: { userId: provider.id, displayName: `${RUN} provider` },
    });
    providerProfileId = providerProfile.id;
    created.profileIds.push(providerProfile.id);
  }, 60_000);

  afterAll(async () => {
    await prisma.client.proposal.deleteMany({ where: { jobId: { in: created.jobIds } } });
    await prisma.client.job.deleteMany({ where: { id: { in: created.jobIds } } });
    await prisma.client.categoryTemplateField.deleteMany({
      where: { categoryTemplate: { categoryId: { in: created.categoryIds } } },
    });
    await prisma.client.category.updateMany({
      where: { id: { in: created.categoryIds } },
      data: { activeCategoryTemplateId: null },
    });
    await prisma.client.categoryTemplate.deleteMany({
      where: { categoryId: { in: created.categoryIds } },
    });
    await prisma.client.category.deleteMany({ where: { id: { in: created.categoryIds } } });
    await prisma.client.profile.deleteMany({ where: { id: { in: created.profileIds } } });
    await prisma.client.user.deleteMany({ where: { id: { in: created.userIds } } });
    await moduleRef.close();
  }, 60_000);

  async function makeCategory(label: string) {
    const category = await prisma.client.category.create({
      data: { name: `${RUN} ${label}`, slug: `${RUN}-${label}` },
    });
    created.categoryIds.push(category.id);
    return category.id;
  }

  it('a category with no active template creates a Job with no lock at all', async () => {
    const categoryId = await makeCategory('unconfigured');

    const job = await jobs.create(clientUserId, {
      title: `${RUN} unconfigured requirement`,
      description: 'A requirement created against a category with no template at all.',
      categoryId,
    });
    created.jobIds.push(job.id);

    expect(job.categoryTemplateId).toBeNull();
    expect(job.categoryData).toBeNull();
  }, 30_000);

  it('create() rejects a missing required categoryData field, writing nothing', async () => {
    const categoryId = await makeCategory('painting-strict');
    await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [
        { key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 },
        { key: 'rooms', label: 'Rooms', type: 'NUMBER', required: false, order: 1 },
      ],
    });

    await expect(
      jobs.create(clientUserId, {
        title: `${RUN} painting requirement, incomplete`,
        description: 'Missing the required area field entirely.',
        categoryId,
        categoryData: { rooms: 3 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  }, 30_000);

  it('create() locks the Job to the category’s current active template and stores validated categoryData', async () => {
    const categoryId = await makeCategory('painting-lock');
    const v1 = await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [
        { key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 },
        {
          key: 'paint-type',
          label: 'Paint type',
          type: 'SELECT',
          required: false,
          order: 1,
          options: ['emulsion', 'enamel'],
        },
      ],
    });

    const job = await jobs.create(clientUserId, {
      title: `${RUN} painting requirement`,
      description: 'A fully valid painting requirement.',
      categoryId,
      categoryData: { area: 250, 'paint-type': 'emulsion' },
    });
    created.jobIds.push(job.id);

    expect(job.categoryTemplateId).toBe(v1.id);
    expect(job.categoryData).toEqual({ area: 250, 'paint-type': 'emulsion' });
  }, 30_000);

  it('a Job stays locked to v1 even after the admin activates v2 — categoryData continues to validate against v1, not v2', async () => {
    const categoryId = await makeCategory('painting-versioned');
    const v1 = await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [{ key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 }],
    });

    const job = await jobs.create(clientUserId, {
      title: `${RUN} v1-locked requirement`,
      description: 'Created while v1 was active; must never move to v2.',
      categoryId,
      categoryData: { area: 200 },
    });
    created.jobIds.push(job.id);
    expect(job.categoryTemplateId).toBe(v1.id);

    // Admin narrows the category: v2 replaces `area` with `square-metres`
    // and makes it required — a real, later, incompatible version.
    const v2 = await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [
        { key: 'square-metres', label: 'Square metres', type: 'NUMBER', required: true, order: 0 },
      ],
    });
    expect(v2.id).not.toBe(v1.id);

    // An update that doesn't touch categoryId must still validate against
    // v1 — the Job's own lock — not v2, which is now the category's active
    // template. Editing only the title must not suddenly require
    // square-metres or reject the Job's existing `area` answer as unknown.
    const updated = await jobs.update(clientUserId, job.id, {
      title: `${RUN} v1-locked, retitled`,
    });
    expect(updated.categoryTemplateId).toBe(v1.id);
    expect(updated.categoryData).toEqual({ area: 200 });

    // The public read reflects the same lock — a provider reading this Job
    // sees the v1-shaped answer, not a v2 one it was never given.
    const rawJob = await prisma.client.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(rawJob.categoryTemplateId).toBe(v1.id);

    // And the public locked-template-read endpoint returns v1's own field
    // set — `area` — never v2's `square-metres`, even though v2 is what
    // getActiveForSlug would now return for this same category.
    const lockedRead = await templates.getVersionForSlug(`${RUN}-painting-versioned`, v1.id);
    expect(lockedRead.template.fields.map((f) => f.key)).toEqual(['area']);

    const activeRead = await templates.getActiveForSlug(`${RUN}-painting-versioned`);
    expect(activeRead.template?.fields.map((f) => f.key)).toEqual(['square-metres']);
  }, 30_000);

  it('changing categoryId re-locks to the new category’s active template and discards the old categoryData, requiring fresh answers', async () => {
    const paintingCategoryId = await makeCategory('painting-move-from');
    await templates.createAndActivate('ADMIN', adminUserId, paintingCategoryId, {
      fields: [{ key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 }],
    });

    const djCategoryId = await makeCategory('dj-move-to');
    const djTemplate = await templates.createAndActivate('ADMIN', adminUserId, djCategoryId, {
      fields: [{ key: 'event-date', label: 'Event date', type: 'DATE', required: true, order: 0 }],
    });

    const job = await jobs.create(clientUserId, {
      title: `${RUN} category-move requirement`,
      description: 'Starts as a painting job with area answered.',
      categoryId: paintingCategoryId,
      categoryData: { area: 300 },
    });
    created.jobIds.push(job.id);

    // Moving to the DJ category without supplying the new template's
    // required field is rejected — the old `area` answer is never silently
    // reinterpreted as satisfying the new template.
    await expect(
      jobs.update(clientUserId, job.id, { categoryId: djCategoryId }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Supplying a fresh, valid categoryData for the new category succeeds,
    // and the old `area` answer is gone — not merged, not carried forward.
    const moved = await jobs.update(clientUserId, job.id, {
      categoryId: djCategoryId,
      categoryData: { 'event-date': '2026-12-24' },
    });
    expect(moved.category.id).toBe(djCategoryId);
    expect(moved.categoryTemplateId).toBe(djTemplate.id);
    expect(moved.categoryData).toEqual({ 'event-date': '2026-12-24' });
    expect(moved.categoryData).not.toHaveProperty('area');
  }, 30_000);

  it('changing categoryId to one with no active template clears both the lock and categoryData', async () => {
    const paintingCategoryId = await makeCategory('painting-move-from-2');
    await templates.createAndActivate('ADMIN', adminUserId, paintingCategoryId, {
      fields: [{ key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 }],
    });

    const unconfiguredCategoryId = await makeCategory('unconfigured-move-to');

    const job = await jobs.create(clientUserId, {
      title: `${RUN} move-to-unconfigured requirement`,
      description: 'Starts as a painting job, moves to a category with nothing configured.',
      categoryId: paintingCategoryId,
      categoryData: { area: 150 },
    });
    created.jobIds.push(job.id);

    const moved = await jobs.update(clientUserId, job.id, { categoryId: unconfiguredCategoryId });

    expect(moved.categoryTemplateId).toBeNull();
    expect(moved.categoryData).toBeNull();
  }, 30_000);

  it('the public locked-template read 404s a template id that does not belong to the category slug in the path', async () => {
    const categoryAId = await makeCategory('cross-scope-a');
    const templateA = await templates.createAndActivate('ADMIN', adminUserId, categoryAId, {
      fields: [{ key: 'notes', label: 'Notes', type: 'TEXT', required: false, order: 0 }],
    });

    const categoryBSlug = `${RUN}-cross-scope-b`;
    await makeCategory('cross-scope-b');

    // templateA is real, but it belongs to category A — reading it through
    // category B's slug must 404, not silently return it.
    await expect(templates.getVersionForSlug(categoryBSlug, templateA.id)).rejects.toThrow();
  }, 30_000);

  it('DirectContracts.create locks and validates categoryData through the exact same shared rule as Jobs', async () => {
    const categoryId = await makeCategory('direct-painting-lock');
    const template = await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [{ key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 }],
    });

    await expect(
      directContracts.create(clientUserId, {
        providerProfileId,
        categoryId,
        title: `${RUN} direct offer, missing categoryData`,
        description: 'A direct-contract offer missing the required area field.',
        price: 20000,
        deliveryDays: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const offer = await directContracts.create(clientUserId, {
      providerProfileId,
      categoryId,
      title: `${RUN} direct offer, valid categoryData`,
      description: 'A compliant direct-contract offer with categoryData supplied.',
      price: 20000,
      deliveryDays: 5,
      categoryData: { area: 500 },
    });
    const offerJob = await prisma.client.job.findUniqueOrThrow({ where: { id: offer.jobId } });
    created.jobIds.push(offerJob.id);

    expect(offerJob.categoryTemplateId).toBe(template.id);
    expect(offerJob.categoryData).toEqual({ area: 500 });
  }, 30_000);
});
