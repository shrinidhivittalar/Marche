import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DirectContractsService } from '../services/direct-contracts.service';
import type { CreateDirectContractDto } from '../dto/create-direct-contract.dto';

const CLIENT_PROFILE = { id: 'client_profile', userId: 'user_client', user: { role: 'CLIENT' } };
const PROVIDER_PROFILE = {
  id: 'provider_profile',
  userId: 'user_provider',
  user: { role: 'PROVIDER' },
};

const DTO: CreateDirectContractDto = {
  providerProfileId: 'provider_profile',
  categoryId: 'category_1',
  title: 'Wedding photography',
  description: 'A full-day wedding shoot, agreed directly.',
  price: 25000,
  deliveryDays: 7,
};

// The tx client $transaction hands the callback — job.create and
// proposal.create are what the service writes through inside it.
const TX = {
  job: { create: jest.fn().mockResolvedValue({ id: 'job_1' }) },
  proposal: { create: jest.fn().mockResolvedValue({ id: 'proposal_1' }) },
};

function build() {
  const profilesRepository = {
    findByUserId: jest.fn().mockResolvedValue(CLIENT_PROFILE),
    findById: jest.fn().mockResolvedValue(PROVIDER_PROFILE),
  };
  const categoriesRepository = {
    findById: jest.fn().mockResolvedValue({ id: 'category_1', name: 'Photography' }),
  };
  const connectionsRepository = {
    create: jest.fn().mockResolvedValue({
      id: 'connection_1',
      job: { id: 'job_1' },
      proposal: { id: 'proposal_1' },
    }),
  };
  const notificationsService = {
    connectionEstablished: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    client: { $transaction: jest.fn().mockImplementation((fn) => fn(TX)) },
  };

  const service = new DirectContractsService(
    prisma as never,
    profilesRepository as never,
    categoriesRepository as never,
    connectionsRepository as never,
    notificationsService as never,
  );

  return {
    service,
    profilesRepository,
    categoriesRepository,
    connectionsRepository,
    notificationsService,
  };
}

describe('DirectContractsService', () => {
  it('creates the job, proposal, and connection in one transaction and notifies both parties', async () => {
    const { service, connectionsRepository, notificationsService } = build();

    const result = await service.create('user_client', DTO);

    expect(TX.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientProfileId: 'client_profile',
          status: 'FILLED',
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
          status: 'ACCEPTED',
          proposedPrice: 25000,
        }),
      }),
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
    expect(notificationsService.connectionEstablished).toHaveBeenCalledWith(
      ['user_client', 'user_provider'],
      expect.objectContaining({ connectionId: 'connection_1' }),
    );
    expect(result.id).toBe('connection_1');
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
      user: { role: 'PROVIDER' },
    });

    await expect(service.create('user_client', DTO)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a category that does not exist', async () => {
    const { service, categoriesRepository } = build();
    categoriesRepository.findById.mockResolvedValue(null);

    await expect(service.create('user_client', DTO)).rejects.toBeInstanceOf(BadRequestException);
  });
});
