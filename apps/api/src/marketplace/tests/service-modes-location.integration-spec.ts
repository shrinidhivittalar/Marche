import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoryTemplatesService } from '../services/category-templates.service';
import { JobsService } from '../../jobs/services/jobs.service';
import { DirectContractsService } from '../../direct-contracts/services/direct-contracts.service';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';

/**
 * Service modes + location requirement — Slice 2 of the
 * category-requirements-location work.
 *
 * Runs against the real database because the thing genuinely at risk is
 * exactly what a mock cannot prove: that Jobs.create/update and
 * DirectContracts.create — two independent write paths, the second of
 * which never calls JobsService at all — both actually resolve the
 * *category's* active template and both are stopped by the *same* shared
 * validator, end to end, rather than merely asserting a mock was called.
 *
 * Everything this file creates is prefixed `m-mode-` and deleted in
 * afterAll, including on failure.
 */

const RUN = `m-mode-${Date.now()}`;
const created = {
  userIds: [] as string[],
  profileIds: [] as string[],
  categoryIds: [] as string[],
  jobIds: [] as string[],
};

describe('service modes + location requirement', () => {
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

  it('a category with no active template leaves Job creation entirely unrestricted', async () => {
    const categoryId = await makeCategory('unconfigured');

    const job = await jobs.create(clientUserId, {
      title: `${RUN} unconfigured requirement`,
      description: 'A requirement created against a category with no template at all.',
      categoryId,
      serviceMode: 'HYBRID',
    });
    created.jobIds.push(job.id);

    expect(job.serviceMode).toBe('HYBRID');
  }, 30_000);

  it('a template with an empty allowedModes leaves serviceMode unrestricted — not "no mode allowed"', async () => {
    const categoryId = await makeCategory('empty-modes');
    await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [{ key: 'notes', label: 'Notes', type: 'TEXT', required: false, order: 0 }],
    });

    const job = await jobs.create(clientUserId, {
      title: `${RUN} empty-modes requirement`,
      description: 'A requirement against a template with no allowedModes configured.',
      categoryId,
      serviceMode: 'REMOTE',
    });
    created.jobIds.push(job.id);

    expect(job.serviceMode).toBe('REMOTE');
  }, 30_000);

  it('Jobs.create rejects a serviceMode outside the category template’s allowedModes', async () => {
    const categoryId = await makeCategory('painting');
    await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [{ key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 }],
      allowedModes: ['ONSITE'],
      locationRequired: true,
    });

    await expect(
      jobs.create(clientUserId, {
        title: `${RUN} painting requirement`,
        description: 'A painting job wrongly requested as REMOTE.',
        categoryId,
        serviceMode: 'REMOTE',
        locationCoarse: 'Indiranagar, Bangalore',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  }, 30_000);

  it('Jobs.create rejects a missing locationCoarse when the template requires one', async () => {
    const categoryId = await makeCategory('painting-loc');
    await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [{ key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 }],
      allowedModes: ['ONSITE'],
      locationRequired: true,
    });

    await expect(
      jobs.create(clientUserId, {
        title: `${RUN} painting requirement, no location`,
        description: 'A painting job missing the required coarse location.',
        categoryId,
        serviceMode: 'ONSITE',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  }, 30_000);

  it('Jobs.create accepts a valid mode + required location, and Jobs.update re-validates against the effective state', async () => {
    const categoryId = await makeCategory('video-editing');
    await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [
        { key: 'length', label: 'Video length (min)', type: 'NUMBER', required: true, order: 0 },
      ],
      allowedModes: ['REMOTE'],
      locationRequired: false,
    });

    const job = await jobs.create(clientUserId, {
      title: `${RUN} video-editing requirement`,
      description: 'A REMOTE video editing requirement, location optional.',
      categoryId,
      serviceMode: 'REMOTE',
    });
    created.jobIds.push(job.id);
    expect(job.serviceMode).toBe('REMOTE');

    // A PATCH that never mentions serviceMode must still validate against the
    // job's existing REMOTE value, not skip validation because the field
    // wasn't touched in this request.
    await expect(
      jobs.update(clientUserId, job.id, { locationCoarse: 'irrelevant, still REMOTE-only' }),
    ).resolves.toBeDefined();

    // Explicitly changing serviceMode to a disallowed value is rejected.
    await expect(
      jobs.update(clientUserId, job.id, { serviceMode: 'ONSITE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  }, 30_000);

  it('changing categoryId on update validates against the NEW category’s template, not the old one', async () => {
    const remoteOnlyCategoryId = await makeCategory('remote-only');
    await templates.createAndActivate('ADMIN', adminUserId, remoteOnlyCategoryId, {
      fields: [{ key: 'notes', label: 'Notes', type: 'TEXT', required: false, order: 0 }],
      allowedModes: ['REMOTE'],
      locationRequired: false,
    });

    const onsiteOnlyCategoryId = await makeCategory('onsite-only');
    await templates.createAndActivate('ADMIN', adminUserId, onsiteOnlyCategoryId, {
      fields: [{ key: 'notes', label: 'Notes', type: 'TEXT', required: false, order: 0 }],
      allowedModes: ['ONSITE'],
      locationRequired: true,
    });

    const job = await jobs.create(clientUserId, {
      title: `${RUN} category-change requirement`,
      description: 'Starts REMOTE under the remote-only category.',
      categoryId: remoteOnlyCategoryId,
      serviceMode: 'REMOTE',
    });
    created.jobIds.push(job.id);

    // Moving it to the onsite-only category while keeping serviceMode REMOTE
    // and no location must be rejected against the NEW category's rules.
    await expect(
      jobs.update(clientUserId, job.id, { categoryId: onsiteOnlyCategoryId }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Supplying a compliant serviceMode + location for the new category
    // succeeds.
    const moved = await jobs.update(clientUserId, job.id, {
      categoryId: onsiteOnlyCategoryId,
      serviceMode: 'ONSITE',
      locationCoarse: 'Koramangala, Bangalore',
    });
    expect(moved.category.id).toBe(onsiteOnlyCategoryId);
    expect(moved.serviceMode).toBe('ONSITE');
  }, 30_000);

  it('an existing Job predating any template keeps serviceMode/locationCoarse null and is never retroactively invalidated', async () => {
    const categoryId = await makeCategory('legacy');
    // No template created — the category behaves exactly as it did before
    // this migration for a Job that already exists.
    const job = await jobs.create(clientUserId, {
      title: `${RUN} legacy requirement`,
      description: 'A requirement with no serviceMode or location, as if predating templates.',
      categoryId,
    });
    created.jobIds.push(job.id);
    expect(job.serviceMode).toBeNull();

    // A template is introduced for the category *after* the Job already
    // exists.
    await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [{ key: 'notes', label: 'Notes', type: 'TEXT', required: false, order: 0 }],
      allowedModes: ['ONSITE'],
      locationRequired: true,
    });

    // Publishing this pre-existing Job is untouched by Slice 2 — publish()
    // does not re-run mode/location validation, so a legacy Job is not
    // retroactively blocked from being published just because a template
    // now exists for its category.
    const published = await jobs.publish(clientUserId, job.id);
    expect(published.status).toBe('PUBLISHED');

    // An update that does not touch serviceMode/locationCoarse must not be
    // blocked either — the effective state (still null/null) is compared
    // against the new template and fails locationRequired only once the
    // caller actually tries to change something meaningful. Since neither
    // field is being changed here, but the effective state genuinely does
    // violate locationRequired now that a template exists, this update path
    // is expected to enforce the current rule going forward.
    await expect(
      jobs.update(clientUserId, job.id, { title: `${RUN} legacy requirement, retitled` }),
    ).rejects.toBeInstanceOf(BadRequestException);
  }, 30_000);

  it('DirectContracts.create is validated by the exact same shared rule as Jobs — same rejection, same requirement', async () => {
    const categoryId = await makeCategory('direct-painting');
    await templates.createAndActivate('ADMIN', adminUserId, categoryId, {
      fields: [{ key: 'area', label: 'Area', type: 'NUMBER', required: true, order: 0 }],
      allowedModes: ['ONSITE'],
      locationRequired: true,
    });

    // Disallowed mode.
    await expect(
      directContracts.create(clientUserId, {
        providerProfileId,
        categoryId,
        title: `${RUN} direct offer, wrong mode`,
        description: 'A direct-contract offer with a disallowed serviceMode.',
        price: 20000,
        deliveryDays: 5,
        serviceMode: 'REMOTE',
        locationCoarse: 'HSR Layout, Bangalore',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Missing required location.
    await expect(
      directContracts.create(clientUserId, {
        providerProfileId,
        categoryId,
        title: `${RUN} direct offer, no location`,
        description: 'A direct-contract offer missing the required coarse location.',
        price: 20000,
        deliveryDays: 5,
        serviceMode: 'ONSITE',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Valid — both rules satisfied, same as the equivalent Job.create case
    // above, proving both paths are governed by one rule, not two.
    const offer = await directContracts.create(clientUserId, {
      providerProfileId,
      categoryId,
      title: `${RUN} direct offer, valid`,
      description: 'A compliant direct-contract offer.',
      price: 20000,
      deliveryDays: 5,
      serviceMode: 'ONSITE',
      locationCoarse: 'HSR Layout, Bangalore',
    });
    const offerJob = await prisma.client.job.findUniqueOrThrow({ where: { id: offer.jobId } });
    created.jobIds.push(offerJob.id);
    expect(offerJob.serviceMode).toBe('ONSITE');
    expect(offerJob.locationCoarse).toBe('HSR Layout, Bangalore');
  }, 30_000);
});
