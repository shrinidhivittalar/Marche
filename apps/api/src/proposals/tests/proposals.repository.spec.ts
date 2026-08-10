import { ProposalsRepository } from '../repositories/proposals.repository';
import { ConnectionsRepository } from '../repositories/connections.repository';
import type { PrismaService } from '../../prisma/prisma.service';

// These assert the shape of the query each repository builds. That is where
// this module's worst bugs live: a transition that reads before it writes and
// lets two decisions both win, or a scoping clause that lets one provider
// touch another's row. Mocking Prisma checks every method cheaply.
function build() {
  const proposal = {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const proposalAttachment = {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
  };
  const connection = {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
  };
  const prisma = {
    client: { proposal, proposalAttachment, connection },
  } as unknown as PrismaService;

  return {
    repository: new ProposalsRepository(prisma),
    connections: new ConnectionsRepository(prisma),
    proposal,
    proposalAttachment,
    connection,
  };
}

describe('ProposalsRepository', () => {
  describe('transitionFromSubmitted', () => {
    // The mechanism the whole module rests on. A findUnique followed by an
    // update would let a client accept and a provider withdraw the same
    // proposal, both having read SUBMITTED, and whichever wrote second would
    // silently win.
    it('carries the status test inside the update, not before it', async () => {
      const { repository, proposal } = build();

      await repository.transitionFromSubmitted(repository.client, 'proposal_1', 'ACCEPTED');

      const [call] = proposal.updateMany.mock.calls;
      expect(call[0].where).toEqual({ id: 'proposal_1', status: 'SUBMITTED' });
    });

    it.each([
      ['ACCEPTED', 'acceptedAt'],
      ['REJECTED', 'rejectedAt'],
      ['WITHDRAWN', 'withdrawnAt'],
    ] as const)('stamps %s onto %s', async (to, field) => {
      const { repository, proposal } = build();

      await repository.transitionFromSubmitted(repository.client, 'proposal_1', to);

      const { data } = proposal.updateMany.mock.calls[0][0];
      expect(data.status).toBe(to);
      expect(data[field]).toBeInstanceOf(Date);
    });

    it('reports zero rows moved so the caller can conflict', async () => {
      const { repository, proposal } = build();
      // What Postgres reports to the loser of a race: the row it wanted no
      // longer matches, because the winner already decided it.
      proposal.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.transitionFromSubmitted(repository.client, 'proposal_1', 'ACCEPTED'),
      ).resolves.toBe(0);
    });

    it('writes through the client it is given', async () => {
      const { repository } = build();
      const tx = { proposal: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } } as never;

      await repository.transitionFromSubmitted(tx, 'proposal_1', 'ACCEPTED');

      expect(
        (tx as unknown as { proposal: { updateMany: jest.Mock } }).proposal.updateMany,
      ).toHaveBeenCalled();
    });
  });

  describe('rejectCompeting', () => {
    it('rejects the other proposals still in play, and only those', async () => {
      const { repository, proposal } = build();

      await repository.rejectCompeting(repository.client, 'job_1', 'winner');

      const { where, data } = proposal.updateMany.mock.calls[0][0];
      // Excluding the winner matters as much as the status filter: without
      // it, the proposal just accepted would be rejected in the same
      // transaction that accepted it.
      expect(where).toEqual({ jobId: 'job_1', status: 'SUBMITTED', id: { not: 'winner' } });
      expect(data.status).toBe('REJECTED');
    });

    it('leaves already-decided proposals alone', async () => {
      const { repository, proposal } = build();

      await repository.rejectCompeting(repository.client, 'job_1', 'winner');

      // A withdrawn proposal must not be rewritten as rejected — the
      // provider walked away, they were not turned down.
      expect(proposal.updateMany.mock.calls[0][0].where.status).toBe('SUBMITTED');
    });
  });

  describe('reads', () => {
    it('shows the client every proposal on their requirement, including withdrawn ones', async () => {
      const { repository, proposal } = build();

      await repository.listByJob('job_1', 0, 20);

      // No status filter: a proposal the client already read must show as
      // withdrawn rather than disappear mid-review.
      expect(proposal.findMany.mock.calls[0][0].where).toEqual({ jobId: 'job_1' });
    });

    it('orders both lists newest-first with a total order', async () => {
      const { repository, proposal } = build();

      await repository.listByJob('job_1', 0, 20);
      await repository.listByProvider('profile_1', 0, 20);

      const expected = [{ submittedAt: 'desc' }, { id: 'asc' }];
      expect(proposal.findMany.mock.calls[0][0].orderBy).toEqual(expected);
      expect(proposal.findMany.mock.calls[1][0].orderBy).toEqual(expected);
    });

    it('scopes a provider list to that provider', async () => {
      const { repository, proposal } = build();

      await repository.listByProvider('profile_1', 0, 20);

      expect(proposal.findMany.mock.calls[0][0].where).toEqual({ providerProfileId: 'profile_1' });
    });

    it('looks a duplicate up by the composite key, not by a scan', async () => {
      const { repository, proposal } = build();

      await repository.findByJobAndProvider('job_1', 'profile_1');

      expect(proposal.findUnique.mock.calls[0][0].where).toEqual({
        jobId_providerProfileId: { jobId: 'job_1', providerProfileId: 'profile_1' },
      });
    });

    it('orders attachments explicitly, not by insertion', async () => {
      const { repository, proposalAttachment } = build();

      await repository.listAttachments('proposal_1');

      // objectKey is selected here so a URL can be signed from it; the
      // service drops it before responding, and that is asserted there.
      expect(proposalAttachment.findMany.mock.calls[0][0].orderBy).toEqual([
        { displayOrder: 'asc' },
        { id: 'asc' },
      ]);
    });
  });

  describe('attachments', () => {
    it('scopes a detach by proposal as well as attachment', async () => {
      const { repository, proposalAttachment } = build();

      await repository.removeAttachment('proposal_1', 'attachment_1');

      // Checking the attachment id alone would let any provider detach any
      // other proposal's file.
      expect(proposalAttachment.deleteMany.mock.calls[0][0].where).toEqual({
        id: 'attachment_1',
        proposalId: 'proposal_1',
      });
    });
  });
});

describe('ConnectionsRepository', () => {
  it('creates only through the client it is given', async () => {
    const { connections, connection } = build();
    const tx = { connection: { create: jest.fn() } };

    connections.create(tx as never, {
      jobId: 'job_1',
      proposalId: 'proposal_1',
      clientProfileId: 'client_1',
      providerProfileId: 'provider_1',
    });

    // A connection must never exist without the accepted proposal and filled
    // requirement it came from, so it is only ever written inside the
    // caller's transaction — never through the repository's own client.
    expect(tx.connection.create).toHaveBeenCalled();
    expect(connection.create).not.toHaveBeenCalled();
  });

  it('finds a profile on either side of the relationship', async () => {
    const { connections, connection } = build();

    await connections.listByProfile('profile_1', 0, 20);

    expect(connection.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ clientProfileId: 'profile_1' }, { providerProfileId: 'profile_1' }],
    });
  });

  it('counts by the same rule it lists by', async () => {
    const { connections, connection } = build();

    await connections.listByProfile('profile_1', 0, 20);
    await connections.countByProfile('profile_1');

    // A count that disagrees with the list gives a page of results with a
    // total that contradicts it.
    expect(connection.count.mock.calls[0][0].where).toEqual(
      connection.findMany.mock.calls[0][0].where,
    );
  });

  it('returns both party ids on a single read, so ownership can be checked', async () => {
    const { connections, connection } = build();

    await connections.findById('connection_1');

    const { select } = connection.findUnique.mock.calls[0][0];
    expect(select.clientProfileId).toBe(true);
    expect(select.providerProfileId).toBe(true);
  });
});
