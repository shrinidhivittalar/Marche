import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectionsService } from '../services/connections.service';

/**
 * The auto-complete sweep's date arithmetic, against a real Postgres
 * DateTime column rather than a mocked Prisma client — the concern
 * connections.repository.spec.ts's mocked assertions cannot rule out
 * (timezone handling, off-by-one on the cutoff boundary).
 *
 * Runs against TEST_DATABASE_URL, same as acceptance.integration-spec.ts.
 * Everything it creates is prefixed `m5-completion-` and deleted in
 * afterAll, including on failure.
 */

const RUN = `m5-completion-${Date.now()}`;
const created = {
  userIds: [] as string[],
  profileIds: [] as string[],
  categoryIds: [] as string[],
  jobIds: [] as string[],
};

describe('connection auto-completion, against real dates', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let connections: ConnectionsService;

  let clientUserId: string;
  let clientProfileId: string;
  let providerProfileId: string;
  let categoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    connections = moduleRef.get(ConnectionsService);

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
      },
    });
    const profile = await prisma.client.profile.create({
      data: { userId: user.id, displayName: `${RUN} ${label}` },
    });
    created.userIds.push(user.id);
    created.profileIds.push(profile.id);
    return { userId: user.id, profileId: profile.id };
  }

  /** A FILLED job, an ACCEPTED proposal, and the Connection they produce — built directly, not through ProposalsService, since only the Connection's own state matters here. */
  async function connectionWithEventDate(eventDate: Date | null) {
    const job = await prisma.client.job.create({
      data: {
        clientProfileId,
        categoryId,
        title: `${RUN} requirement`,
        description: 'A requirement created by the connection-completion integration test.',
        status: 'FILLED',
        publishedAt: new Date(),
        eventDate,
      },
    });
    created.jobIds.push(job.id);

    const proposal = await prisma.client.proposal.create({
      data: {
        jobId: job.id,
        providerProfileId,
        coverMessage: 'A cover message from the connection-completion integration test.',
        proposedPrice: 25000,
        deliveryDays: 7,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    const connection = await prisma.client.connection.create({
      data: { jobId: job.id, proposalId: proposal.id, clientProfileId, providerProfileId },
    });

    return connection.id;
  }

  it('completes a connection whose event happened well past the grace period', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const connectionId = await connectionWithEventDate(eightDaysAgo);

    // findById runs the sweep before reading — this is the real code path
    // the controller uses, not a direct call to the sweep method.
    const result = await connections.findById(clientUserId, connectionId);

    expect(result.status).toBe('COMPLETED');
    expect(result.completedAt).not.toBeNull();
  }, 30_000);

  it('leaves a connection ACTIVE when its event is within the grace period', async () => {
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const connectionId = await connectionWithEventDate(yesterday);

    const result = await connections.findById(clientUserId, connectionId);

    expect(result.status).toBe('ACTIVE');
  }, 30_000);

  it('leaves a connection ACTIVE when its job has no event date at all', async () => {
    const connectionId = await connectionWithEventDate(null);

    const result = await connections.findById(clientUserId, connectionId);

    expect(result.status).toBe('ACTIVE');
  }, 30_000);

  it('lets the client confirm complete once the event date has passed, and only once', async () => {
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const connectionId = await connectionWithEventDate(yesterday);

    const first = await connections.confirmComplete(clientUserId, connectionId);
    expect(first.status).toBe('COMPLETED');

    // Idempotent — the second call must return the same row, not error and
    // not stamp a new completedAt.
    const second = await connections.confirmComplete(clientUserId, connectionId);
    expect(second.completedAt).toEqual(first.completedAt);
  }, 30_000);
});
