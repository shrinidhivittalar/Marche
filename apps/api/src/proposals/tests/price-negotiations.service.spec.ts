import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PriceNegotiationsService } from '../services/price-negotiations.service';

const CLIENT_PROFILE_ID = 'client_profile';
const PROVIDER_PROFILE_ID = 'provider_profile';
const OTHER_PROVIDER_PROFILE_ID = 'other_provider_profile';

const TX = { marker: 'tx' };

function build(
  over: {
    job?: Record<string, unknown>;
    proposal?: Record<string, unknown>;
    negotiation?: Record<string, unknown>;
  } = {},
) {
  const job = {
    id: 'job_1',
    clientProfileId: CLIENT_PROFILE_ID,
    isDirect: false,
    ...over.job,
  };
  const proposal = {
    id: 'proposal_1',
    jobId: 'job_1',
    providerProfileId: PROVIDER_PROFILE_ID,
    status: 'SUBMITTED',
    proposedPrice: 50000,
    ...over.proposal,
  };
  const negotiation = {
    id: 'negotiation_1',
    proposalId: 'proposal_1',
    proposedByProfileId: PROVIDER_PROFILE_ID,
    amount: 42000,
    status: 'PROPOSED',
    ...over.negotiation,
  };

  const proposalsRepository = {
    findById: jest.fn().mockResolvedValue(proposal),
  };
  const jobsRepository = {
    findById: jest.fn().mockResolvedValue(job),
  };
  const profilesRepository = {
    findByUserId: jest.fn().mockImplementation((userId: string) => {
      if (userId === 'client_user') return Promise.resolve({ id: CLIENT_PROFILE_ID });
      if (userId === 'provider_user') return Promise.resolve({ id: PROVIDER_PROFILE_ID });
      if (userId === 'other_provider_user') {
        return Promise.resolve({ id: OTHER_PROVIDER_PROFILE_ID });
      }
      return Promise.resolve(null);
    }),
  };
  const negotiationsRepository = {
    create: jest.fn().mockResolvedValue(negotiation),
    findById: jest.fn().mockResolvedValue(negotiation),
    findRawById: jest.fn().mockResolvedValue(negotiation),
    listByProposal: jest.fn().mockResolvedValue([negotiation]),
    hasPending: jest.fn().mockResolvedValue(false),
    transitionFromProposed: jest.fn().mockResolvedValue(1),
    claimAgreedPrice: jest.fn().mockResolvedValue(1),
    client: { marker: 'ordinary' },
  };
  const prisma = {
    client: { $transaction: jest.fn().mockImplementation((fn) => fn(TX)) },
  };

  const service = new PriceNegotiationsService(
    negotiationsRepository as never,
    proposalsRepository as never,
    jobsRepository as never,
    profilesRepository as never,
    prisma as never,
  );

  return { service, negotiationsRepository, proposalsRepository, jobsRepository, job, proposal };
}

describe('PriceNegotiationsService.propose', () => {
  it('lets the provider propose a new price', async () => {
    const { service, negotiationsRepository } = build();

    const created = await service.propose('provider_user', 'proposal_1', 42000);

    expect(negotiationsRepository.create).toHaveBeenCalledWith({
      proposalId: 'proposal_1',
      proposedByProfileId: PROVIDER_PROFILE_ID,
      amount: 42000,
    });
    expect(created.amount).toBe(42000);
  });

  it('lets the client propose a new price', async () => {
    const { service, negotiationsRepository } = build();

    await service.propose('client_user', 'proposal_1', 45000);

    expect(negotiationsRepository.create).toHaveBeenCalledWith({
      proposalId: 'proposal_1',
      proposedByProfileId: CLIENT_PROFILE_ID,
      amount: 45000,
    });
  });

  it('rejects a caller who is neither the requirement’s client nor the proposal’s provider', async () => {
    const { service } = build();

    await expect(
      service.propose('other_provider_user', 'proposal_1', 42000),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not touch the original proposedPrice — proposedPrice stays the immutable snapshot', async () => {
    const { service, proposalsRepository, proposal } = build();

    await service.propose('provider_user', 'proposal_1', 42000);

    // The service never calls any write against ProposalsRepository at all —
    // propose() only ever writes a new ProposalPriceNegotiation row.
    expect(proposalsRepository.findById).toHaveBeenCalled();
    expect(proposal.proposedPrice).toBe(50000);
  });

  it('rejects a second round while one is still pending (partial-unique-index race surfaced as 409)', async () => {
    const { service, negotiationsRepository } = build();
    negotiationsRepository.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.propose('provider_user', 'proposal_1', 40000)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects negotiation on a proposal that is no longer SUBMITTED', async () => {
    const { service } = build({ proposal: { status: 'ACCEPTED' } });

    await expect(service.propose('provider_user', 'proposal_1', 42000)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects negotiation on a direct-contract job — isDirect is excluded from ordinary price negotiation', async () => {
    const { service } = build({ job: { isDirect: true } });

    await expect(service.propose('provider_user', 'proposal_1', 42000)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('PriceNegotiationsService.accept', () => {
  it('accepts a round the other party proposed and sets Proposal.agreedPrice', async () => {
    const { service, negotiationsRepository } = build();

    await service.accept('client_user', 'proposal_1', 'negotiation_1');

    expect(negotiationsRepository.transitionFromProposed).toHaveBeenCalledWith(
      TX,
      'negotiation_1',
      'ACCEPTED',
      CLIENT_PROFILE_ID,
    );
    expect(negotiationsRepository.claimAgreedPrice).toHaveBeenCalledWith(TX, 'proposal_1', 42000);
  });

  it('refuses to let the proposer accept their own round', async () => {
    // negotiation.proposedByProfileId defaults to PROVIDER_PROFILE_ID
    const { service } = build();

    await expect(
      service.accept('provider_user', 'proposal_1', 'negotiation_1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a caller uninvolved with the proposal entirely', async () => {
    const { service } = build();

    await expect(
      service.accept('other_provider_user', 'proposal_1', 'negotiation_1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('409s if the round was already decided (concurrent accept/reject race)', async () => {
    const { service, negotiationsRepository } = build();
    negotiationsRepository.transitionFromProposed.mockResolvedValue(0);

    await expect(
      service.accept('client_user', 'proposal_1', 'negotiation_1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('409s if the parent proposal was decided elsewhere while the round was pending', async () => {
    const { service, negotiationsRepository } = build();
    negotiationsRepository.claimAgreedPrice.mockResolvedValue(0);

    await expect(
      service.accept('client_user', 'proposal_1', 'negotiation_1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s a negotiation id that does not belong to this proposal', async () => {
    const { service, negotiationsRepository } = build();
    negotiationsRepository.findRawById.mockResolvedValue({
      id: 'negotiation_1',
      proposalId: 'some_other_proposal',
      proposedByProfileId: PROVIDER_PROFILE_ID,
      status: 'PROPOSED',
    });

    await expect(
      service.accept('client_user', 'proposal_1', 'negotiation_1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PriceNegotiationsService.reject', () => {
  it('lets the other party reject without changing agreedPrice', async () => {
    const { service, negotiationsRepository } = build();

    await service.reject('client_user', 'proposal_1', 'negotiation_1');

    expect(negotiationsRepository.transitionFromProposed).toHaveBeenCalledWith(
      negotiationsRepository.client,
      'negotiation_1',
      'REJECTED',
      CLIENT_PROFILE_ID,
    );
    expect(negotiationsRepository.claimAgreedPrice).not.toHaveBeenCalled();
  });

  it('refuses to let the proposer reject their own round', async () => {
    const { service } = build();

    await expect(
      service.reject('provider_user', 'proposal_1', 'negotiation_1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PriceNegotiationsService.withdraw', () => {
  it('lets the proposer withdraw their own pending round', async () => {
    const { service, negotiationsRepository } = build();

    await service.withdraw('provider_user', 'proposal_1', 'negotiation_1');

    expect(negotiationsRepository.transitionFromProposed).toHaveBeenCalledWith(
      negotiationsRepository.client,
      'negotiation_1',
      'WITHDRAWN',
      null,
    );
  });

  it('refuses to let the other party withdraw a round they did not propose', async () => {
    const { service } = build();

    await expect(
      service.withdraw('client_user', 'proposal_1', 'negotiation_1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PriceNegotiationsService.list', () => {
  it('returns the full round-by-round history for either party', async () => {
    const { service, negotiationsRepository } = build();

    const history = await service.list('client_user', 'proposal_1');

    expect(negotiationsRepository.listByProposal).toHaveBeenCalledWith('proposal_1');
    expect(history).toHaveLength(1);
  });

  it('rejects a caller with no standing on the proposal', async () => {
    const { service } = build();

    await expect(service.list('other_provider_user', 'proposal_1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('multi-proposal isolation', () => {
  it('two proposals on the same job negotiate independently — one cannot see or move the other', async () => {
    // Proposal A: our usual provider. Proposal B: a different provider on
    // the same job. Each build() call is a fully independent set of mocks,
    // matching how two real Proposal rows share nothing but jobId.
    const proposalA = build();
    const proposalB = build({
      proposal: { id: 'proposal_2', providerProfileId: OTHER_PROVIDER_PROFILE_ID },
      negotiation: {
        id: 'negotiation_2',
        proposalId: 'proposal_2',
        proposedByProfileId: OTHER_PROVIDER_PROFILE_ID,
      },
    });

    await proposalA.service.propose('provider_user', 'proposal_1', 42000);
    await proposalB.service.propose('other_provider_user', 'proposal_2', 39000);

    // Each service instance only ever touched its own proposal's repository
    // call — there is no shared mutable state a cross-proposal write could
    // land in.
    expect(proposalA.negotiationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: 'proposal_1' }),
    );
    expect(proposalB.negotiationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: 'proposal_2' }),
    );

    // The client cannot accept proposal B's round through proposal A's
    // resolved identity — attempting it 403s because that provider profile
    // is not a party on proposal A's job/proposal pairing.
    await expect(
      proposalA.service.accept('other_provider_user', 'proposal_1', 'negotiation_2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
