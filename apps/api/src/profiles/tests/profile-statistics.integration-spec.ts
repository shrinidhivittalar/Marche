import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfilesService } from '../services/profiles.service';

/**
 * Module 02 Slice 1 — real profile statistics (completedProjects,
 * averageRating, totalReviews), computed on read from Connection/Review,
 * replacing the hardcoded-zero placeholder in ProfilesService.toPublicView.
 *
 * Runs against TEST_DATABASE_URL, through the real AppModule — this is what
 * actually exercises the ProfilesModule <-> ReviewsModule forwardRef wiring
 * (see profiles.module.ts/reviews.module.ts), which a mocked unit test
 * cannot prove resolves at real Nest bootstrap.
 *
 * Everything created is prefixed `m2-stats-${Date.now()}` and deleted in
 * afterAll, including on failure.
 */

const RUN = `m2-stats-${Date.now()}`;
const created = {
  userIds: [] as string[],
  profileIds: [] as string[],
  categoryIds: [] as string[],
  jobIds: [] as string[],
};

describe('profile statistics (GET /u/:username)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let profiles: ProfilesService;

  let clientUserId: string;
  let clientProfileId: string;
  let categoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    profiles = moduleRef.get(ProfilesService);

    const client = await makeUser('CLIENT', 'client');
    clientUserId = client.userId;
    clientProfileId = client.profileId;

    const category = await prisma.client.category.create({
      data: { name: `${RUN} category`, slug: `${RUN}-category` },
    });
    categoryId = category.id;
    created.categoryIds.push(category.id);
  }, 60_000);

  afterAll(async () => {
    const connectionIds = (
      await prisma.client.connection.findMany({
        where: { jobId: { in: created.jobIds } },
        select: { id: true },
      })
    ).map((row) => row.id);
    await prisma.client.review.deleteMany({ where: { connectionId: { in: connectionIds } } });
    await prisma.client.connection.deleteMany({ where: { jobId: { in: created.jobIds } } });
    await prisma.client.proposal.deleteMany({ where: { jobId: { in: created.jobIds } } });
    await prisma.client.job.deleteMany({ where: { id: { in: created.jobIds } } });
    await prisma.client.category.deleteMany({ where: { id: { in: created.categoryIds } } });
    await prisma.client.profile.deleteMany({ where: { id: { in: created.profileIds } } });
    await prisma.client.user.deleteMany({ where: { id: { in: created.userIds } } });
    await moduleRef.close();
  }, 60_000);

  async function makeUser(role: 'CLIENT' | 'PROVIDER', label: string) {
    const user = await prisma.client.user.create({
      data: {
        email: `${RUN}-${label}@example.invalid`,
        passwordHash: 'integration-test-only',
        name: `${RUN} ${label}`,
        role,
        capabilities: { create: { capability: role } },
      },
    });
    const profile = await prisma.client.profile.create({
      data: { userId: user.id, displayName: `${RUN} ${label}`, username: `${RUN}-${label}` },
    });
    created.userIds.push(user.id);
    created.profileIds.push(profile.id);
    return { userId: user.id, profileId: profile.id, username: profile.username as string };
  }

  /** A COMPLETED connection between the fixed client and a given provider. */
  async function completedConnection(providerProfileId: string): Promise<string> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const job = await prisma.client.job.create({
      data: {
        clientProfileId,
        categoryId,
        title: `${RUN} requirement`,
        description: 'A requirement created by the profile-statistics integration test.',
        status: 'FILLED',
        publishedAt: new Date(),
        eventDate: yesterday,
      },
    });
    created.jobIds.push(job.id);

    const proposal = await prisma.client.proposal.create({
      data: {
        jobId: job.id,
        providerProfileId,
        coverMessage: 'A cover message from the profile-statistics integration test.',
        proposedPrice: 25000,
        deliveryDays: 7,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    const connection = await prisma.client.connection.create({
      data: {
        jobId: job.id,
        proposalId: proposal.id,
        clientProfileId,
        providerProfileId,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    return connection.id;
  }

  /** An ACTIVE (not completed) connection — must never count toward completedProjects. */
  async function activeConnection(providerProfileId: string): Promise<void> {
    const job = await prisma.client.job.create({
      data: {
        clientProfileId,
        categoryId,
        title: `${RUN} active requirement`,
        description: 'An in-progress requirement — must not inflate completedProjects.',
        status: 'FILLED',
        publishedAt: new Date(),
        eventDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    created.jobIds.push(job.id);

    const proposal = await prisma.client.proposal.create({
      data: {
        jobId: job.id,
        providerProfileId,
        coverMessage: 'Still in progress.',
        proposedPrice: 25000,
        deliveryDays: 7,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    await prisma.client.connection.create({
      data: {
        jobId: job.id,
        proposalId: proposal.id,
        clientProfileId,
        providerProfileId,
        status: 'ACTIVE',
      },
    });
  }

  it('reports zero statistics for a profile with no completed projects or reviews', async () => {
    const provider = await makeUser('PROVIDER', 'zero');

    const result = await profiles.getPublicProfileByUsername(provider.username);

    expect(result.statistics).toEqual({
      completedProjects: 0,
      averageRating: null,
      totalReviews: 0,
    });
  }, 30_000);

  it('counts N completed projects and computes the real average rating over visible reviews only', async () => {
    const provider = await makeUser('PROVIDER', 'active');

    const connectionA = await completedConnection(provider.profileId);
    const connectionB = await completedConnection(provider.profileId);

    // Both parties review connection A -> immediately visible (sibling
    // exists). Only the client reviews connection B -> stays blind inside
    // the 14-day reveal window, so it must NOT count toward totalReviews or
    // averageRating yet, even though the underlying project is completed.
    await prisma.client.review.create({
      data: {
        connectionId: connectionA,
        reviewerUserId: clientUserId,
        revieweeProfileId: provider.profileId,
        rating: 4,
        comment: 'Great work.',
      },
    });
    await prisma.client.review.create({
      data: {
        connectionId: connectionA,
        reviewerUserId: provider.userId,
        revieweeProfileId: clientProfileId,
        rating: 5,
        comment: 'Great client.',
      },
    });
    await prisma.client.review.create({
      data: {
        connectionId: connectionB,
        reviewerUserId: clientUserId,
        revieweeProfileId: provider.profileId,
        rating: 2,
        comment: 'One-sided, still inside the reveal window.',
      },
    });

    const result = await profiles.getPublicProfileByUsername(provider.username);

    expect(result.statistics).toEqual({
      completedProjects: 2,
      averageRating: 4, // only connectionA's review (rating 4) is visible
      totalReviews: 1,
    });
  }, 30_000);

  it('does not count an ACTIVE (not yet completed) connection toward completedProjects', async () => {
    const provider = await makeUser('PROVIDER', 'inprogress');
    await activeConnection(provider.profileId);

    const result = await profiles.getPublicProfileByUsername(provider.username);

    expect(result.statistics.completedProjects).toBe(0);
  }, 30_000);
});
