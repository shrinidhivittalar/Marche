import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../services/jobs.service';
import { ProposalsService } from '../../proposals/services/proposals.service';
import { ConnectionsService } from '../../proposals/services/connections.service';
import { DirectContractsService } from '../../direct-contracts/services/direct-contracts.service';
import { RedisThrottlerStorage } from '../../throttler/redis-throttler-storage';

/**
 * Job location privacy — Slice 1 of the category-requirements/location work.
 *
 * Runs against the real database because the thing under test is exactly
 * what a mock cannot prove: that locationExact genuinely never travels
 * through a shared select shape, across every real read path (Jobs'
 * public/owner reads, Proposals' provider view, Connections' both-party
 * view), for both an ordinary marketplace hire and a direct contract.
 *
 * Everything this file creates is prefixed `m-loc-` and deleted in
 * afterAll, including on failure.
 */

const RUN = `m-loc-${Date.now()}`;
const created = {
  userIds: [] as string[],
  profileIds: [] as string[],
  categoryIds: [] as string[],
  jobIds: [] as string[],
};

describe('Job location privacy', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let jobs: JobsService;
  let proposals: ProposalsService;
  let connections: ConnectionsService;
  let directContracts: DirectContractsService;

  let clientUserId: string;
  let providerAUserId: string;
  let providerAProfileId: string;
  let providerBUserId: string;
  let providerBProfileId: string;
  let strangerUserId: string;
  let categoryId: string;

  const EXACT = { address: '221B Baker Street', pincode: '560001' };

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
    jobs = moduleRef.get(JobsService);
    proposals = moduleRef.get(ProposalsService);
    connections = moduleRef.get(ConnectionsService);
    directContracts = moduleRef.get(DirectContractsService);

    const client = await makeUser('CLIENT', 'client');
    clientUserId = client.userId;

    const providerA = await makeUser('PROVIDER', 'provider-a');
    providerAUserId = providerA.userId;
    providerAProfileId = providerA.profileId;

    const providerB = await makeUser('PROVIDER', 'provider-b');
    providerBUserId = providerB.userId;
    providerBProfileId = providerB.profileId;

    const stranger = await makeUser('PROVIDER', 'stranger');
    strangerUserId = stranger.userId;

    const category = await prisma.client.category.create({
      data: { name: `${RUN} category`, slug: `${RUN}-category` },
    });
    categoryId = category.id;
    created.categoryIds.push(category.id);
  }, 60_000);

  afterAll(async () => {
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

  // Writes locationExact directly — Slice 1 ships the disclosure mechanism,
  // not a UI to collect a real address (see the slice report), so real
  // usage today never populates this column. Set here only to prove the
  // redaction logic actually redacts something real.
  async function jobWithExactLocation() {
    const job = await jobs.create(clientUserId, {
      title: `${RUN} requirement`,
      description: 'A requirement created by the location-privacy integration test.',
      categoryId,
      locationCoarse: 'Bandra, Mumbai',
    });
    await prisma.client.job.update({ where: { id: job.id }, data: { locationExact: EXACT } });
    await jobs.publish(clientUserId, job.id);
    created.jobIds.push(job.id);
    return job;
  }

  it('a public/anonymous read sees coarse location only', async () => {
    const job = await jobWithExactLocation();

    const publicView = await jobs.findPublicById(job.id);

    expect(publicView).toMatchObject({ locationCoarse: 'Bandra, Mumbai' });
    expect(publicView).not.toHaveProperty('locationExact');
  }, 30_000);

  it('an applicant who has not been hired sees coarse location only', async () => {
    const job = await jobWithExactLocation();
    const proposal = await proposals.submit(providerAUserId, {
      jobId: job.id,
      coverMessage: 'A cover message from the location-privacy integration test.',
      proposedPrice: 20000,
      deliveryDays: 5,
    });

    const view = await proposals.findById(providerAUserId, proposal.id);

    expect(view).toMatchObject({ job: { locationCoarse: 'Bandra, Mumbai', locationExact: null } });
  }, 30_000);

  it('an unrelated provider who never applied cannot obtain exact location, and is refused entirely on the party-scoped reads', async () => {
    const job = await jobWithExactLocation();
    const proposal = await proposals.submit(providerAUserId, {
      jobId: job.id,
      coverMessage: 'A cover message from the location-privacy integration test.',
      proposedPrice: 20000,
      deliveryDays: 5,
    });

    // The public route still shows coarse only.
    const publicView = await jobs.findPublicById(job.id);
    expect(publicView).toMatchObject({ locationCoarse: 'Bandra, Mumbai' });
    expect(publicView).not.toHaveProperty('locationExact');

    // The party-scoped proposal route refuses a stranger outright — there is
    // no "coarse view" of someone else's proposal, only public discovery.
    await expect(proposals.findById(strangerUserId, proposal.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  }, 30_000);

  it('the job owner always sees exact location', async () => {
    const job = await jobWithExactLocation();

    const own = await jobs.findMineById(clientUserId, job.id);

    expect(own).toMatchObject({ locationExact: EXACT });
  }, 30_000);

  it('once hired, the provider sees exact location; the job owner still does too', async () => {
    const job = await jobWithExactLocation();
    const proposal = await proposals.submit(providerAUserId, {
      jobId: job.id,
      coverMessage: 'A cover message from the location-privacy integration test.',
      proposedPrice: 20000,
      deliveryDays: 5,
    });
    const connection = await proposals.accept(clientUserId, proposal.id);

    const providerView = await proposals.findById(providerAUserId, proposal.id);
    expect(providerView).toMatchObject({ job: { locationExact: EXACT } });

    const ownerView = await jobs.findMineById(clientUserId, job.id);
    expect(ownerView).toMatchObject({ locationExact: EXACT });

    const connectionAsClient = await connections.findById(clientUserId, connection.id);
    const connectionAsProvider = await connections.findById(providerAUserId, connection.id);
    expect(connectionAsClient).toMatchObject({ job: { locationExact: EXACT } });
    expect(connectionAsProvider).toMatchObject({ job: { locationExact: EXACT } });
  }, 30_000);

  it('multiple proposals: hiring Provider B does not leak exact location to Provider A', async () => {
    const job = await jobWithExactLocation();
    const proposalA = await proposals.submit(providerAUserId, {
      jobId: job.id,
      coverMessage: 'Provider A cover message, long enough to pass validation.',
      proposedPrice: 18000,
      deliveryDays: 5,
    });
    // A fresh, separate job for B's competing proposal would not exercise
    // the shared-Job case — resubmit against the SAME job under a second
    // provider profile instead, matching the real "multiple proposals on
    // one Job" shape.
    await proposals.submit(providerBUserId, {
      jobId: job.id,
      coverMessage: 'Provider B cover message, long enough to pass validation.',
      proposedPrice: 19000,
      deliveryDays: 4,
    });

    const proposalBRow = await prisma.client.proposal.findFirstOrThrow({
      where: { jobId: job.id, providerProfileId: providerBProfileId },
    });
    await proposals.accept(clientUserId, proposalBRow.id);

    // Provider A: still coarse only — never hired.
    const aView = await proposals.findById(providerAUserId, proposalA.id);
    expect(aView).toMatchObject({ job: { locationCoarse: 'Bandra, Mumbai', locationExact: null } });

    // Provider B: hired, sees exact.
    const bView = await proposals.findById(providerBUserId, proposalBRow.id);
    expect(bView).toMatchObject({ job: { locationExact: EXACT } });
  }, 30_000);

  it('a direct-contract job discloses exact location to the named provider once they accept, and to no one else, through the same primitive', async () => {
    const offer = await directContracts.create(clientUserId, {
      providerProfileId: providerAProfileId,
      categoryId,
      title: `${RUN} direct offer`,
      description: 'A direct-contract offer from the location-privacy integration test.',
      price: 25000,
      deliveryDays: 6,
      locationCoarse: 'Koramangala, Bangalore',
    });
    const job = await prisma.client.job.findUniqueOrThrow({ where: { id: offer.jobId } });
    created.jobIds.push(job.id);
    await prisma.client.job.update({
      where: { id: job.id },
      data: { locationExact: { address: '42 Direct Contract Lane' } },
    });

    // Never discoverable at all — the same shared publicJobWhere filter
    // (isDirect: false) already excludes it, regardless of location.
    await expect(jobs.findPublicById(job.id)).rejects.toThrow();

    // Before acceptance: not yet hired, not entitled to exact — reached
    // through the provider's own-proposal view of the offer.
    const beforeAccept = await proposals.findById(providerAUserId, offer.id);
    expect(beforeAccept).toMatchObject({ job: { locationExact: null } });

    await directContracts.accept(providerAUserId, offer.id);

    const afterAccept = await proposals.findById(providerAUserId, offer.id);
    expect(afterAccept).toMatchObject({
      job: { locationExact: { address: '42 Direct Contract Lane' } },
    });

    // No special-cased logic was written for this — findHiredProviderProfileId
    // and findLocationExact are exactly the same calls the ordinary flow
    // uses, which this assertion set is really proving.
  }, 30_000);
});
