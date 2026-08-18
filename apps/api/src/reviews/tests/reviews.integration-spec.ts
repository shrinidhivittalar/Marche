import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ReviewsService } from '../services/reviews.service';

/**
 * The one property reviews.service.spec.ts's mocked test cannot prove: that
 * Postgres' own unique constraint on [connectionId, reviewerUserId] — not
 * just the service's check-then-write pre-check — is what stops a genuine
 * race between two concurrent submissions from the same reviewer. Same
 * shape as acceptance.integration-spec.ts's "lets only one of two
 * simultaneous submissions through".
 *
 * Runs against TEST_DATABASE_URL. Everything it creates is prefixed
 * `m5-review-race-` and deleted in afterAll, including on failure.
 */

const RUN = `m5-review-race-${Date.now()}`;
const created = {
  userIds: [] as string[],
  profileIds: [] as string[],
  categoryIds: [] as string[],
  jobIds: [] as string[],
};

describe('review submission under concurrency', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let reviews: ReviewsService;

  let clientUserId: string;
  let clientProfileId: string;
  let providerProfileId: string;
  let categoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    reviews = moduleRef.get(ReviewsService);

    const client = await makeUser('CLIENT', 'client');
    clientUserId = client.userId;
    clientProfileId = client.profileId;

    const provider = await makeUser('PROVIDER', 'provider');
    providerProfileId = provider.profileId;

    const category = await prisma.client.category.create({
      data: { name: `${RUN} category`, slug: `${RUN}-category` },
    });
    categoryId = category.id;
    created.categoryIds.push(category.id);
  }, 60_000);

  afterAll(async () => {
    await prisma.client.review.deleteMany({
      where: { connectionId: { in: await connectionIds() } },
    });
    await prisma.client.connection.deleteMany({ where: { jobId: { in: created.jobIds } } });
    await prisma.client.proposal.deleteMany({ where: { jobId: { in: created.jobIds } } });
    await prisma.client.job.deleteMany({ where: { id: { in: created.jobIds } } });
    await prisma.client.category.deleteMany({ where: { id: { in: created.categoryIds } } });
    await prisma.client.profile.deleteMany({ where: { id: { in: created.profileIds } } });
    await prisma.client.user.deleteMany({ where: { id: { in: created.userIds } } });
    await moduleRef.close();
  }, 60_000);

  async function connectionIds(): Promise<string[]> {
    const rows = await prisma.client.connection.findMany({
      where: { jobId: { in: created.jobIds } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async function makeUser(role: 'CLIENT' | 'PROVIDER', label: string) {
    const user = await prisma.client.user.create({
      data: {
        email: `${RUN}-${label}@example.invalid`,
        passwordHash: 'integration-test-only',
        name: `${RUN} ${label}`,
        role,
      },
    });
    const profile = await prisma.client.profile.create({
      data: { userId: user.id, displayName: `${RUN} ${label}` },
    });
    created.userIds.push(user.id);
    created.profileIds.push(profile.id);
    return { userId: user.id, profileId: profile.id };
  }

  /** A COMPLETED connection, built directly — only its final state matters here, not how it got there. */
  async function completedConnection(): Promise<string> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const job = await prisma.client.job.create({
      data: {
        clientProfileId,
        categoryId,
        title: `${RUN} requirement`,
        description: 'A requirement created by the review-race integration test.',
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
        coverMessage: 'A cover message from the review-race integration test.',
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

  const both = <T>(a: Promise<T>, b: Promise<T>) => Promise.allSettled([a, b]);
  const rejections = (results: PromiseSettledResult<unknown>[]) =>
    results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

  it('lets only one of two simultaneous reviews from the same reviewer through', async () => {
    const connectionId = await completedConnection();

    // Issued before either is awaited — two genuinely overlapping writes,
    // which is the only arrangement that exercises the unique constraint
    // rather than the service's own (non-atomic) pre-check.
    const results = await both(
      reviews.submit(clientUserId, connectionId, 5, 'First submission.'),
      reviews.submit(clientUserId, connectionId, 1, 'Second submission.'),
    );

    const failed = rejections(results);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ConflictException);

    const stored = await prisma.client.review.findMany({
      where: { connectionId, reviewerUserId: clientUserId },
    });
    expect(stored).toHaveLength(1);
  }, 30_000);
});
