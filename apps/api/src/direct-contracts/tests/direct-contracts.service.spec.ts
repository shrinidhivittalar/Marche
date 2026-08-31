import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DirectContractsService } from '../services/direct-contracts.service';
import type { CreateDirectContractDto } from '../dto/create-direct-contract.dto';

const CLIENT_PROFILE = {
  id: 'client_profile',
  userId: 'user_client',
  user: {
    role: 'CLIENT',
    capabilities: [{ capability: 'CLIENT' }],
    emailVerifiedAt: new Date('2026-01-01'),
  },
};
const PROVIDER_PROFILE = {
  id: 'provider_profile',
  userId: 'user_provider',
  user: {
    role: 'PROVIDER',
    capabilities: [{ capability: 'PROVIDER' }],
    emailVerifiedAt: new Date('2026-01-01'),
  },
};

const DTO: CreateDirectContractDto = {
  providerProfileId: 'provider_profile',
  categoryId: 'category_1',
  title: 'Wedding photography',
  description: 'A full-day wedding shoot, agreed directly.',
  price: 25000,
  deliveryDays: 7,
};

const DIRECT_JOB = { id: 'job_1', clientProfileId: 'client_profile', isDirect: true };
const SUBMITTED_PROPOSAL = {
  id: 'proposal_1',
  jobId: 'job_1',
  providerProfileId: 'provider_profile',
  status: 'SUBMITTED',
};

// The tx client $transaction hands the callback — job.create and
// proposal.create are what create() writes through inside it.
const TX = {
  job: { create: jest.fn().mockResolvedValue({ id: 'job_1' }) },
  proposal: { create: jest.fn().mockResolvedValue({ id: 'proposal_1' }) },
};

function build() {
  const profilesRepository = {
    findByUserId: jest
      .fn()
      .mockImplementation((userId: string) =>
        Promise.resolve(userId === 'user_provider' ? PROVIDER_PROFILE : CLIENT_PROFILE),
      ),
    findById: jest.fn().mockResolvedValue(PROVIDER_PROFILE),
    findUserIdById: jest.fn().mockResolvedValue('user_client'),
  };
  const jobsRepository = {
    findById: jest.fn().mockResolvedValue(DIRECT_JOB),
    claimFilled: jest.fn().mockResolvedValue(1),
  };
  const categoriesRepository = {
    findById: jest.fn().mockResolvedValue({ id: 'category_1', name: 'Photography' }),
  };
  // No active template by default — every existing test exercises the
  // unrestricted path. See the dedicated 'service mode + location rules'
  // describe block for the enforcing path.
  const categoryTemplatesService = {
    assertModeAndLocation: jest.fn().mockResolvedValue(undefined),
  };
  const proposalsRepository = {
    findById: jest.fn().mockResolvedValue(SUBMITTED_PROPOSAL),
    transitionFromSubmitted: jest.fn().mockResolvedValue(1),
    client: {},
  };
  const connectionsRepository = {
    create: jest.fn().mockResolvedValue({
      id: 'connection_1',
      job: { id: 'job_1' },
      proposal: { id: 'proposal_1' },
    }),
  };
  const notificationsService = {
    directContractOffered: jest.fn().mockResolvedValue(undefined),
    directContractAccepted: jest.fn().mockResolvedValue(undefined),
    directContractDeclined: jest.fn().mockResolvedValue(undefined),
    connectionEstablished: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    client: { $transaction: jest.fn().mockImplementation((fn) => fn(TX)) },
  };

  const service = new DirectContractsService(
    prisma as never,
    profilesRepository as never,
    jobsRepository as never,
    categoriesRepository as never,
    categoryTemplatesService as never,
    proposalsRepository as never,
    connectionsRepository as never,
    notificationsService as never,
  );

  return {
    service,
    profilesRepository,
    categoryTemplatesService,
    jobsRepository,
    categoriesRepository,
    proposalsRepository,
    connectionsRepository,
    notificationsService,
  };
}

describe('DirectContractsService.create', () => {
  it('creates a pending offer — a DRAFT job and a SUBMITTED proposal, no connection yet', async () => {
    const { service, connectionsRepository, notificationsService } = build();

    const result = await service.create('user_client', DTO);

    expect(TX.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientProfileId: 'client_profile',
          status: 'DRAFT',
          isDirect: true,
          budgetMin: 25000,
          budgetMax: 25000,
        }),
      }),
    );
    expect(TX.proposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: 'job_1',
          providerProfileId: 'provider_profile',
          status: 'SUBMITTED',
          proposedPrice: 25000,
        }),
      }),
    );
    // Nothing is binding at creation time — the whole point of the fix.
    expect(connectionsRepository.create).not.toHaveBeenCalled();
    expect(notificationsService.directContractOffered).toHaveBeenCalledWith(
      'user_provider',
      expect.objectContaining({ proposalId: 'proposal_1' }),
    );
    expect(result.id).toBe('proposal_1');
  });

  describe('service mode + location rules', () => {
    it('calls the same shared validator JobsService uses — not a second implementation of the rule', async () => {
      const { service, categoryTemplatesService } = build();

      await service.create('user_client', {
        ...DTO,
        serviceMode: 'ONSITE',
        locationCoarse: 'Pune',
      });

      expect(categoryTemplatesService.assertModeAndLocation).toHaveBeenCalledWith(
        'category_1',
        'ONSITE',
        'Pune',
      );
    });

    it('propagates the shared validator’s rejection and never reaches the transaction', async () => {
      const { service, categoryTemplatesService } = build();
      categoryTemplatesService.assertModeAndLocation.mockRejectedValue(
        new BadRequestException('serviceMode must be one of: REMOTE for this category'),
      );
      const jobCallsBefore = TX.job.create.mock.calls.length;
      const proposalCallsBefore = TX.proposal.create.mock.calls.length;

      await expect(
        service.create('user_client', { ...DTO, serviceMode: 'ONSITE' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(TX.job.create.mock.calls.length).toBe(jobCallsBefore);
      expect(TX.proposal.create.mock.calls.length).toBe(proposalCallsBefore);
    });

    it('a category with nothing configured accepts any serviceMode — compatibility preserved', async () => {
      const { service } = build();

      await expect(
        service.create('user_client', { ...DTO, serviceMode: 'HYBRID' }),
      ).resolves.toBeDefined();
    });

    it('rejects a missing locationCoarse when the category requires one, before writing anything', async () => {
      const { service, categoryTemplatesService } = build();
      categoryTemplatesService.assertModeAndLocation.mockRejectedValue(
        new BadRequestException('locationCoarse is required for this category'),
      );
      const jobCallsBefore = TX.job.create.mock.calls.length;

      await expect(service.create('user_client', DTO)).rejects.toBeInstanceOf(BadRequestException);
      expect(TX.job.create.mock.calls.length).toBe(jobCallsBefore);
    });

    it('writes serviceMode onto the created job', async () => {
      const { service } = build();

      await service.create('user_client', { ...DTO, serviceMode: 'REMOTE' });

      expect(TX.job.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ serviceMode: 'REMOTE' }) }),
      );
    });
  });

  it('rejects a client with an unverified email', async () => {
    const { service, profilesRepository } = build();
    profilesRepository.findByUserId.mockResolvedValue({
      ...CLIENT_PROFILE,
      user: { ...CLIENT_PROFILE.user, emailVerifiedAt: null },
    });

    await expect(service.create('user_client', DTO)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a non-client caller', async () => {
    const { service, profilesRepository } = build();
    profilesRepository.findByUserId.mockResolvedValue({
      id: 'someone',
      userId: 'user_x',
      user: { role: 'PROVIDER' },
    });

    await expect(service.create('user_x', DTO)).rejects.toThrow();
  });

  it('rejects a provider profile that does not exist', async () => {
    const { service, profilesRepository } = build();
    profilesRepository.findById.mockResolvedValue(null);

    await expect(service.create('user_client', DTO)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a target profile that is not a provider', async () => {
    const { service, profilesRepository } = build();
    profilesRepository.findById.mockResolvedValue({
      id: 'not_a_provider',
      userId: 'user_other',
      user: { role: 'CLIENT' },
    });

    await expect(service.create('user_client', DTO)).rejects.toThrow();
  });

  it('refuses to let a client hire themselves', async () => {
    const { service, profilesRepository } = build();
    profilesRepository.findById.mockResolvedValue({
      id: 'client_profile_as_provider',
      userId: 'user_client',
      user: { role: 'PROVIDER', capabilities: [{ capability: 'PROVIDER' }] },
    });

    await expect(service.create('user_client', DTO)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a category that does not exist', async () => {
    const { service, categoriesRepository } = build();
    categoriesRepository.findById.mockResolvedValue(null);

    await expect(service.create('user_client', DTO)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('DirectContractsService.accept', () => {
  it('claims the job, accepts the proposal, creates the connection, and notifies both parties', async () => {
    const {
      service,
      jobsRepository,
      proposalsRepository,
      connectionsRepository,
      notificationsService,
    } = build();

    const result = await service.accept('user_provider', 'proposal_1');

    expect(jobsRepository.claimFilled).toHaveBeenCalledWith(TX, 'job_1', ['DRAFT']);
    expect(proposalsRepository.transitionFromSubmitted).toHaveBeenCalledWith(
      TX,
      'proposal_1',
      'ACCEPTED',
    );
    expect(connectionsRepository.create).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        jobId: 'job_1',
        proposalId: 'proposal_1',
        clientProfileId: 'client_profile',
        providerProfileId: 'provider_profile',
      }),
    );
    expect(notificationsService.directContractAccepted).toHaveBeenCalledWith(
      'user_client',
      expect.objectContaining({ connectionId: 'connection_1' }),
    );
    expect(notificationsService.connectionEstablished).toHaveBeenCalledWith(
      ['user_client', 'user_provider'],
      expect.objectContaining({ connectionId: 'connection_1' }),
    );
    expect(result.id).toBe('connection_1');
  });

  it('rejects a caller who is not the named provider', async () => {
    const { service } = build();

    await expect(service.accept('user_someone_else', 'proposal_1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('404s a proposal id that does not exist', async () => {
    const { service, proposalsRepository } = build();
    proposalsRepository.findById.mockResolvedValue(null);

    await expect(service.accept('user_provider', 'proposal_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s a proposal whose job is not a direct contract', async () => {
    const { service, jobsRepository } = build();
    jobsRepository.findById.mockResolvedValue({ ...DIRECT_JOB, isDirect: false });

    await expect(service.accept('user_provider', 'proposal_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('409s if the job was already claimed (double accept / race)', async () => {
    const { service, jobsRepository } = build();
    jobsRepository.claimFilled.mockResolvedValue(0);

    await expect(service.accept('user_provider', 'proposal_1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('DirectContractsService.decline', () => {
  it('rejects the proposal and notifies the client', async () => {
    const { service, proposalsRepository, notificationsService } = build();

    await service.decline('user_provider', 'proposal_1');

    expect(proposalsRepository.transitionFromSubmitted).toHaveBeenCalledWith(
      proposalsRepository.client,
      'proposal_1',
      'REJECTED',
    );
    expect(notificationsService.directContractDeclined).toHaveBeenCalledWith(
      'user_client',
      expect.objectContaining({ proposalId: 'proposal_1' }),
    );
  });

  it('rejects a caller who is not the named provider', async () => {
    const { service } = build();

    await expect(service.decline('user_someone_else', 'proposal_1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('409s an offer that was already decided', async () => {
    const { service, proposalsRepository } = build();
    proposalsRepository.transitionFromSubmitted.mockResolvedValue(0);

    await expect(service.decline('user_provider', 'proposal_1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
