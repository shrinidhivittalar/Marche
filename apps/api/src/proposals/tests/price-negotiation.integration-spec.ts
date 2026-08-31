import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { PriceNegotiationsService } from '../services/price-negotiations.service';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';

/**
 * Negotiated commercial terms, run against the real database.
 *
 * Same reasoning as acceptance.integration-spec.ts: the partial unique index
 * (proposal_price_negotiations_one_pending_per_proposal) and the conditional
 * UPDATEs in PriceNegotiationsRepository are safety properties a mock cannot
 * prove — only Postgres actually serialising two concurrent writers on one
 * row demonstrates them.
 *
 * Everything this file creates is prefixed `m5-negotiation-` and deleted in
 * afterAll, including on failure.
 */

const RUN = `m5-negotiation-${Date.now()}`;
const created = {
  userIds: [] as string[],
  profileIds: [] as string[],
  categoryIds: [] as string[],
  jobIds: [] as string[],
};

describe('proposal price negotiation', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let negotiations: PriceNegotiationsService;

  let clientUserId: string;
  let clientProfileId: string;
  let providerAUserId: string;
  let providerAProfileId: string;
  let providerBUserId: string;
  let providerBProfileId: string;
  let categoryId: string;

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
    negotiations = moduleRef.get(PriceNegotiationsService);

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
    await prisma.client.proposalPriceNegotiation.deleteMany({
      where: { proposal: { jobId: { in: created.jobIds } } },
    });
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
        emailVerifiedAt: new Date(),
      },
    });
    const profile = await prisma.client.profile.create({
      data: { userId: user.id, displayName: `${RUN} ${label}` },
    });
    created.userIds.push(user.id);
    created.profileIds.push(profile.id);
    return { userId: user.id, profileId: profile.id };
  }

  async function publishedJob(budgetMin = 50000, budgetMax = 50000) {
    const job = await prisma.client.job.create({
      data: {
        clientProfileId,
        categoryId,
        title: `${RUN} requirement`,
        description: 'A requirement created by the Module 5 price negotiation integration test.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        budgetMin,
        budgetMax,
      },
    });
    created.jobIds.push(job.id);
    return job;
  }

  function proposalOn(jobId: string, providerProfileId: string, proposedPrice = 50000) {
    return prisma.client.proposal.create({
      data: {
        jobId,
        providerProfileId,
        coverMessage: 'A cover message from the Module 5 price negotiation integration test.',
        proposedPrice,
        deliveryDays: 7,
      },
    });
  }

  const both = <T>(a: Promise<T>, b: Promise<T>) => Promise.allSettled([a, b]);
  const rejections = (results: PromiseSettledResult<unknown>[]) =>
    results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

  it('negotiates a lower price without losing the original — the full audit chain', async () => {
    const job = await publishedJob(50000, 50000);
    const proposal = await proposalOn(job.id, providerAProfileId, 50000);

    const round = await negotiations.propose(clientUserId, proposal.id, 42000);
    expect(round.status).toBe('PROPOSED');
    expect(Number(round.amount)).toBe(42000);

    const accepted = await negotiations.accept(providerAUserId, proposal.id, round.id);
    expect(accepted.status).toBe('ACCEPTED');

    const finalJob = await prisma.client.job.findUniqueOrThrow({ where: { id: job.id } });
    const finalProposal = await prisma.client.proposal.findUniqueOrThrow({
      where: { id: proposal.id },
    });
    const history = await negotiations.list(clientUserId, proposal.id);

    // The original Job budget — what the client actually posted — is
    // completely untouched by anything this feature does.
    expect(Number(finalJob.budgetMin)).toBe(50000);
    expect(Number(finalJob.budgetMax)).toBe(50000);

    // The original offer stays the immutable snapshot; agreedPrice is the
    // new authoritative figure, held separately.
    expect(Number(finalProposal.proposedPrice)).toBe(50000);
    expect(Number(finalProposal.agreedPrice)).toBe(42000);
    expect(finalProposal.agreedPriceAt).not.toBeNull();

    // The full round survives as history — who proposed it, who accepted
    // it, when.
    expect(history).toHaveLength(1);
    expect(history[0].proposedByProfileId).toBe(clientProfileId);
    expect(history[0].respondedByProfileId).toBe(providerAProfileId);
    expect(history[0].status).toBe('ACCEPTED');
  }, 30_000);

  it('an unauthorized user cannot see or act on a negotiation they are not party to', async () => {
    const job = await publishedJob();
    const proposal = await proposalOn(job.id, providerAProfileId);
    const round = await negotiations.propose(providerAUserId, proposal.id, 40000);

    await expect(negotiations.list(providerBUserId, proposal.id)).rejects.toThrow();
    await expect(negotiations.accept(providerBUserId, proposal.id, round.id)).rejects.toThrow();
  }, 30_000);

  it('two proposals on the same job negotiate independently', async () => {
    const job = await publishedJob();
    const proposalA = await proposalOn(job.id, providerAProfileId, 45000);
    const proposalB = await proposalOn(job.id, providerBProfileId, 55000);

    const roundA = await negotiations.propose(clientUserId, proposalA.id, 40000);
    await negotiations.accept(providerAUserId, proposalA.id, roundA.id);

    // Provider B's proposal was never touched by anything on proposal A.
    const untouchedB = await prisma.client.proposal.findUniqueOrThrow({
      where: { id: proposalB.id },
    });
    expect(untouchedB.agreedPrice).toBeNull();
    expect(Number(untouchedB.proposedPrice)).toBe(55000);

    // And provider B has no standing on proposal A's negotiation.
    await expect(negotiations.list(providerBUserId, proposalA.id)).rejects.toThrow();
  }, 30_000);

  it('only one of two simultaneous proposals on the same proposal wins the race', async () => {
    const job = await publishedJob();
    const proposal = await proposalOn(job.id, providerAProfileId);

    const results = await both(
      negotiations.propose(clientUserId, proposal.id, 41000),
      negotiations.propose(providerAUserId, proposal.id, 39000),
    );

    const failed = rejections(results);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ConflictException);

    const pendingCount = await prisma.client.proposalPriceNegotiation.count({
      where: { proposalId: proposal.id, status: 'PROPOSED' },
    });
    expect(pendingCount).toBe(1);
  }, 30_000);

  it('only one of two simultaneous responses to the same round wins the race', async () => {
    const job = await publishedJob();
    const proposal = await proposalOn(job.id, providerAProfileId);
    const round = await negotiations.propose(providerAUserId, proposal.id, 40000);

    const results = await both(
      negotiations.accept(clientUserId, proposal.id, round.id),
      negotiations.reject(clientUserId, proposal.id, round.id),
    );

    const failed = rejections(results);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ConflictException);

    const finalRound = await prisma.client.proposalPriceNegotiation.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(['ACCEPTED', 'REJECTED']).toContain(finalRound.status);
  }, 30_000);

  it('a direct-contract job never accepts an ordinary price-negotiation round', async () => {
    const directJob = await prisma.client.job.create({
      data: {
        clientProfileId,
        categoryId,
        title: `${RUN} direct job`,
        description: 'A direct-contract job created by the price negotiation integration test.',
        status: 'DRAFT',
        isDirect: true,
        budgetMin: 30000,
        budgetMax: 30000,
      },
    });
    created.jobIds.push(directJob.id);
    const offer = await prisma.client.proposal.create({
      data: {
        jobId: directJob.id,
        providerProfileId: providerAProfileId,
        coverMessage: 'Direct contract, offered outside the marketplace.',
        proposedPrice: 30000,
        deliveryDays: 5,
      },
    });

    await expect(negotiations.propose(clientUserId, offer.id, 25000)).rejects.toThrow();
  }, 30_000);
});
