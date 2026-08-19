import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ProposalsService } from '../services/proposals.service';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';

/**
 * The one test in this module that a mock cannot stand in for.
 *
 * Every other spec asserts the *shape* of a query — that the status test
 * travels inside the UPDATE, that the claim is written first. None of them
 * can prove that Postgres actually serialises two writers on that row, and
 * that is the entire safety property: a CRUD implementation passes all of
 * them while still letting one requirement be filled twice in production.
 *
 * So this runs against the real database, in real transactions, with real
 * concurrency.
 *
 * Part of the default suite. It was excluded while the hosted application
 * database was the only one available — a run that writes had no safe place
 * to write. TEST_DATABASE_URL is that place, so this now runs with
 * everything else, under jest.integration.config.js. To run it alone:
 *
 *   npm --workspace @marche/api run test:integration
 *
 * Everything it creates is prefixed `m5-concurrency-` and deleted in
 * afterAll, including on failure.
 */

const RUN = `m5-concurrency-${Date.now()}`;
const created = {
  userIds: [] as string[],
  profileIds: [] as string[],
  categoryIds: [] as string[],
  jobIds: [] as string[],
};

describe('proposal acceptance under concurrency', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let proposals: ProposalsService;

  let clientUserId: string;
  let clientProfileId: string;
  let providerAUserId: string;
  let providerBUserId: string;
  let providerAProfileId: string;
  let providerBProfileId: string;
  let categoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // This suite calls services directly and never sends an HTTP request,
      // so the throttler guard never runs — overridden only so module
      // compilation doesn't need a real Redis connection (see .env's
      // REDIS_URL placeholder and apps/api/src/throttler).
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
    proposals = moduleRef.get(ProposalsService);

    const client = await makeUser('CLIENT', 'client');
    clientUserId = client.userId;
    clientProfileId = client.profileId;

    const providerA = await makeUser('PROVIDER', 'provider-a');
    providerAUserId = providerA.userId;
    providerAProfileId = providerA.profileId;

    const providerB = await makeUser('PROVIDER', 'provider-b');
    providerBUserId = providerB.userId;
    providerBProfileId = providerB.profileId;

    const category = await prisma.client.category.create({
      data: { name: `${RUN} category`, slug: `${RUN}-category` },
    });
    categoryId = category.id;
    created.categoryIds.push(category.id);
  }, 60_000);

  afterAll(async () => {
    // Deleted in FK order, and unconditionally: a failed assertion must not
    // leave rows behind in a database the deployed application reads.
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
        // Not a real hash. Nothing in this file authenticates — the services
        // are called directly with a user id, which is what the JWT guard
        // would have produced.
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

  async function publishedJob() {
    const job = await prisma.client.job.create({
      data: {
        clientProfileId,
        categoryId,
        title: `${RUN} requirement`,
        description: 'A requirement created by the Module 5 concurrency integration test.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    created.jobIds.push(job.id);
    return job;
  }

  function proposalOn(jobId: string, providerProfileId: string) {
    return prisma.client.proposal.create({
      data: {
        jobId,
        providerProfileId,
        coverMessage: 'A cover message from the Module 5 concurrency integration test.',
        proposedPrice: 25000,
        deliveryDays: 7,
      },
    });
  }

  // Settled results, so the loser's rejection can be inspected rather than
  // failing the run.
  const both = <T>(a: Promise<T>, b: Promise<T>) => Promise.allSettled([a, b]);

  const rejections = (results: PromiseSettledResult<unknown>[]) =>
    results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

  it('produces exactly one winner when two proposals are accepted at once', async () => {
    const job = await publishedJob();
    const a = await proposalOn(job.id, providerAProfileId);
    const b = await proposalOn(job.id, providerBProfileId);

    // Issued before either is awaited: two genuinely overlapping
    // transactions, which is the only arrangement that exercises the race.
    const results = await both(
      proposals.accept(clientUserId, a.id),
      proposals.accept(clientUserId, b.id),
    );

    const failed = rejections(results);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ConflictException);

    const [afterA, afterB] = await Promise.all([
      prisma.client.proposal.findUnique({ where: { id: a.id } }),
      prisma.client.proposal.findUnique({ where: { id: b.id } }),
    ]);

    // Exactly one accepted, and the other rejected rather than left sitting
    // at SUBMITTED — a losing provider must not be told they are still in
    // the running for something already decided.
    const statuses = [afterA?.status, afterB?.status].sort();
    expect(statuses).toEqual(['ACCEPTED', 'REJECTED']);

    const filled = await prisma.client.job.findUnique({ where: { id: job.id } });
    expect(filled?.status).toBe('FILLED');

    const connections = await prisma.client.connection.findMany({ where: { jobId: job.id } });
    expect(connections).toHaveLength(1);
    expect(connections[0].proposalId).toBe(afterA?.status === 'ACCEPTED' ? a.id : b.id);
  }, 60_000);

  it('leaves nothing behind when the losing acceptance rolls back', async () => {
    const job = await publishedJob();
    const a = await proposalOn(job.id, providerAProfileId);
    const b = await proposalOn(job.id, providerBProfileId);

    await both(proposals.accept(clientUserId, a.id), proposals.accept(clientUserId, b.id));

    // The loser's transaction claimed the job first and then rolled back.
    // Partial state would show up here as a second connection, or as both
    // acceptedAt timestamps being set.
    const stamped = await prisma.client.proposal.findMany({
      where: { jobId: job.id, acceptedAt: { not: null } },
    });
    expect(stamped).toHaveLength(1);
    expect(stamped[0].status).toBe('ACCEPTED');
  }, 60_000);

  it('never lets a proposal be accepted and withdrawn at once', async () => {
    const job = await publishedJob();
    const a = await proposalOn(job.id, providerAProfileId);

    const results = await both(
      proposals.accept(clientUserId, a.id),
      proposals.withdraw(providerAUserId, a.id) as Promise<unknown>,
    );

    // One of the two must lose. Which one is genuinely a race and either
    // answer is correct; both succeeding is not.
    expect(rejections(results)).toHaveLength(1);

    const after = await prisma.client.proposal.findUnique({ where: { id: a.id } });
    expect(['ACCEPTED', 'WITHDRAWN']).toContain(after?.status);
    // The losing transition must not have stamped its timestamp.
    expect(after?.acceptedAt !== null && after?.withdrawnAt !== null).toBe(false);

    const filled = await prisma.client.job.findUnique({ where: { id: job.id } });
    const connections = await prisma.client.connection.count({ where: { jobId: job.id } });
    if (after?.status === 'ACCEPTED') {
      expect(filled?.status).toBe('FILLED');
      expect(connections).toBe(1);
    } else {
      // The withdrawal won, so the acceptance rolled back and the
      // requirement must still be open for someone else.
      expect(filled?.status).toBe('PUBLISHED');
      expect(connections).toBe(0);
    }
  }, 60_000);

  it('never lets a proposal be accepted and rejected at once', async () => {
    const job = await publishedJob();
    const a = await proposalOn(job.id, providerAProfileId);

    const results = await both(
      proposals.accept(clientUserId, a.id),
      proposals.reject(clientUserId, a.id) as Promise<unknown>,
    );

    expect(rejections(results)).toHaveLength(1);

    const after = await prisma.client.proposal.findUnique({ where: { id: a.id } });
    expect(after?.acceptedAt !== null && after?.rejectedAt !== null).toBe(false);
  }, 60_000);

  it('lets only one of two simultaneous submissions through', async () => {
    const job = await publishedJob();

    const dto = {
      jobId: job.id,
      coverMessage: 'A cover message from the Module 5 concurrency integration test.',
      proposedPrice: 25000,
      deliveryDays: 7,
    };

    // Both requests pass the service-layer duplicate pre-check before either
    // writes, so this is the case only the unique constraint can decide —
    // and the case that verifies P2002 is the error Prisma really raises,
    // which module5-edge-cases.md flagged as needing checking rather than
    // assuming.
    const results = await both(
      proposals.submit(providerBUserId, dto),
      proposals.submit(providerBUserId, dto),
    );

    const failed = rejections(results);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ConflictException);

    const stored = await prisma.client.proposal.findMany({ where: { jobId: job.id } });
    expect(stored).toHaveLength(1);
  }, 60_000);
});
