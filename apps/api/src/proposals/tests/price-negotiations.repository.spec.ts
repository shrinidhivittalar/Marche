import { PriceNegotiationsRepository } from '../repositories/price-negotiations.repository';
import type { PrismaService } from '../../prisma/prisma.service';

function build() {
  const proposalPriceNegotiation = {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const proposal = {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = {
    client: { proposalPriceNegotiation, proposal },
  } as unknown as PrismaService;

  return {
    repository: new PriceNegotiationsRepository(prisma),
    proposalPriceNegotiation,
    proposal,
  };
}

describe('PriceNegotiationsRepository', () => {
  describe('transitionFromProposed', () => {
    // The mechanism the whole feature's race-safety rests on — same reason
    // ProposalsRepository.transitionFromSubmitted carries its status test
    // inside the UPDATE rather than a findUnique-then-update: two
    // simultaneous responses (accept + reject, or a withdraw racing an
    // accept) must serialise on the row, not on application logic.
    it('carries the status test inside the update, not before it', async () => {
      const { repository, proposalPriceNegotiation } = build();

      await repository.transitionFromProposed(
        { proposalPriceNegotiation } as never,
        'negotiation_1',
        'ACCEPTED',
        'client_profile',
      );

      expect(proposalPriceNegotiation.updateMany).toHaveBeenCalledWith({
        where: { id: 'negotiation_1', status: 'PROPOSED' },
        data: {
          status: 'ACCEPTED',
          respondedByProfileId: 'client_profile',
          respondedAt: expect.any(Date),
        },
      });
    });

    it('does not stamp respondedByProfileId on a WITHDRAWN transition when null is passed', async () => {
      const { repository, proposalPriceNegotiation } = build();

      await repository.transitionFromProposed(
        { proposalPriceNegotiation } as never,
        'negotiation_1',
        'WITHDRAWN',
        null,
      );

      expect(proposalPriceNegotiation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ respondedByProfileId: null }) }),
      );
    });

    it('resolves to the row count, not a truthy object — 0 means the caller lost the race', async () => {
      const { repository, proposalPriceNegotiation } = build();
      proposalPriceNegotiation.updateMany.mockResolvedValue({ count: 0 });

      const moved = await repository.transitionFromProposed(
        { proposalPriceNegotiation } as never,
        'negotiation_1',
        'REJECTED',
        'client_profile',
      );

      expect(moved).toBe(0);
    });
  });

  describe('claimAgreedPrice', () => {
    it('is conditional on the parent proposal still being SUBMITTED', async () => {
      const { repository, proposal } = build();

      await repository.claimAgreedPrice({ proposal } as never, 'proposal_1', 42000);

      expect(proposal.updateMany).toHaveBeenCalledWith({
        where: { id: 'proposal_1', status: 'SUBMITTED' },
        data: { agreedPrice: 42000, agreedPriceAt: expect.any(Date) },
      });
    });

    it('resolves to 0 when the proposal was already decided elsewhere', async () => {
      const { repository, proposal } = build();
      proposal.updateMany.mockResolvedValue({ count: 0 });

      const moved = await repository.claimAgreedPrice({ proposal } as never, 'proposal_1', 42000);

      expect(moved).toBe(0);
    });
  });

  describe('hasPending', () => {
    it('is true only when a PROPOSED row exists for this proposal', async () => {
      const { repository, proposalPriceNegotiation } = build();
      proposalPriceNegotiation.count.mockResolvedValue(1);

      const pending = await repository.hasPending('proposal_1');

      expect(proposalPriceNegotiation.count).toHaveBeenCalledWith({
        where: { proposalId: 'proposal_1', status: 'PROPOSED' },
      });
      expect(pending).toBe(true);
    });

    it('is false when none is pending', async () => {
      const { repository, proposalPriceNegotiation } = build();
      proposalPriceNegotiation.count.mockResolvedValue(0);

      expect(await repository.hasPending('proposal_1')).toBe(false);
    });

    // ProposalsService.accept re-checks this inside its transaction, against
    // `tx`, for read consistency with the writes landing in that same
    // transaction — same reasoning as claimAgreedPrice taking a transaction
    // client. Proves the optional client is actually used, not defaulted to
    // the ordinary one when supplied.
    it('reads through a supplied transaction client instead of the ordinary one', async () => {
      const { repository, proposalPriceNegotiation } = build();
      const txCount = jest.fn().mockResolvedValue(1);
      const tx = { proposalPriceNegotiation: { count: txCount } } as never;

      const pending = await repository.hasPending('proposal_1', tx);

      expect(txCount).toHaveBeenCalledWith({
        where: { proposalId: 'proposal_1', status: 'PROPOSED' },
      });
      expect(proposalPriceNegotiation.count).not.toHaveBeenCalled();
      expect(pending).toBe(true);
    });
  });

  describe('create', () => {
    it('writes exactly proposalId, proposedByProfileId and amount — no status, no ids the caller should not control', async () => {
      const { repository, proposalPriceNegotiation } = build();

      await repository.create({
        proposalId: 'proposal_1',
        proposedByProfileId: 'provider_profile',
        amount: 42000,
      });

      expect(proposalPriceNegotiation.create).toHaveBeenCalledWith({
        data: { proposalId: 'proposal_1', proposedByProfileId: 'provider_profile', amount: 42000 },
      });
    });
  });

  describe('listByProposal', () => {
    it('orders oldest first — a timeline, not a feed', async () => {
      const { repository, proposalPriceNegotiation } = build();

      await repository.listByProposal('proposal_1');

      expect(proposalPriceNegotiation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { proposalId: 'proposal_1' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });
  });
});
