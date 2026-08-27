import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SavedProvidersService } from '../services/saved-providers.service';

function build() {
  const savedProvidersRepository = {
    create: jest.fn().mockResolvedValue({ id: 'save_1' }),
    find: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ id: 'save_1' }),
    listByClient: jest.fn().mockResolvedValue([]),
    countByClient: jest.fn().mockResolvedValue(0),
  };
  const profilesRepository = {
    findByUserId: jest.fn().mockResolvedValue({ id: 'profile_client' }),
    findById: jest.fn().mockResolvedValue({
      id: 'profile_provider',
      user: { role: 'PROVIDER', capabilities: [{ capability: 'PROVIDER' }] },
    }),
  };
  const servicesRepository = {
    findProviderCards: jest.fn().mockResolvedValue([]),
  };
  const mediaService = {
    signViewUrl: jest.fn().mockResolvedValue(null),
  };

  const service = new SavedProvidersService(
    savedProvidersRepository as never,
    profilesRepository as never,
    servicesRepository as never,
    mediaService as never,
  );

  return {
    service,
    savedProvidersRepository,
    profilesRepository,
    servicesRepository,
    mediaService,
  };
}

describe('SavedProvidersService', () => {
  describe('save', () => {
    it('saves a provider profile for the calling client', async () => {
      const { service, savedProvidersRepository } = build();

      await service.save(
        'user_client',
        { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
        'profile_provider',
      );

      expect(savedProvidersRepository.create).toHaveBeenCalledWith(
        'profile_client',
        'profile_provider',
      );
    });

    it('refuses a provider trying to save', async () => {
      const { service } = build();

      await expect(
        service.save('user_provider', { role: 'PROVIDER' }, 'profile_provider'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to save a profile that is not a provider', async () => {
      const { service, profilesRepository } = build();
      profilesRepository.findById.mockResolvedValue({
        id: 'profile_client_2',
        user: { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
      });

      await expect(
        service.save(
          'user_client',
          { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
          'profile_client_2',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s when the target profile does not exist or is not visible to the caller', async () => {
      const { service, profilesRepository } = build();
      profilesRepository.findById.mockResolvedValue(null);

      await expect(
        service.save(
          'user_client',
          { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
          'missing',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is idempotent — saving an already-saved provider returns the existing row, not a duplicate', async () => {
      const { service, savedProvidersRepository } = build();
      const existing = { id: 'save_existing' };
      savedProvidersRepository.find.mockResolvedValue(existing);

      const result = await service.save(
        'user_client',
        { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
        'profile_provider',
      );

      expect(result).toBe(existing);
      expect(savedProvidersRepository.create).not.toHaveBeenCalled();
    });

    it('recovers from a unique-constraint race by returning the row the other request just created', async () => {
      const { service, savedProvidersRepository } = build();
      savedProvidersRepository.create.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );
      const winner = { id: 'save_winner' };
      savedProvidersRepository.find
        .mockResolvedValueOnce(null) // pre-check: not saved yet
        .mockResolvedValueOnce(winner); // post-race: the other request won

      const result = await service.save(
        'user_client',
        { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
        'profile_provider',
      );

      expect(result).toBe(winner);
    });
  });

  describe('isSaved', () => {
    it('is true when a save row exists for the calling client', async () => {
      const { service, savedProvidersRepository } = build();
      savedProvidersRepository.find.mockResolvedValue({ id: 'save_1' });

      await expect(
        service.isSaved(
          'user_client',
          { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
          'profile_provider',
        ),
      ).resolves.toBe(true);
    });

    it('is false when no save row exists', async () => {
      const { service } = build();

      await expect(
        service.isSaved(
          'user_client',
          { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
          'profile_provider',
        ),
      ).resolves.toBe(false);
    });

    it('is false for a provider, without even checking — a provider can never have saved anyone', async () => {
      const { service, profilesRepository } = build();

      await expect(
        service.isSaved('user_provider', { role: 'PROVIDER' }, 'profile_x'),
      ).resolves.toBe(false);
      expect(profilesRepository.findByUserId).not.toHaveBeenCalled();
    });
  });

  describe('unsave', () => {
    it('deletes the save for the calling client', async () => {
      const { service, savedProvidersRepository } = build();

      await service.unsave(
        'user_client',
        { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
        'profile_provider',
      );

      expect(savedProvidersRepository.delete).toHaveBeenCalledWith(
        'profile_client',
        'profile_provider',
      );
    });

    it('is a no-op, not an error, when nothing was saved', async () => {
      const { service, savedProvidersRepository } = build();
      savedProvidersRepository.delete.mockRejectedValue(
        new Error('Record to delete does not exist'),
      );

      await expect(
        service.unsave(
          'user_client',
          { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
          'profile_provider',
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('listMine', () => {
    it('reapplies save order onto the provider cards, since findProviderCards does not preserve it', async () => {
      const { service, savedProvidersRepository, servicesRepository } = build();
      savedProvidersRepository.listByClient.mockResolvedValue([
        { providerProfileId: 'p2' },
        { providerProfileId: 'p1' },
      ]);
      servicesRepository.findProviderCards.mockResolvedValue([
        { id: 'p1', displayName: 'First', avatarMedia: null },
        { id: 'p2', displayName: 'Second', avatarMedia: null },
      ]);

      const result = await service.listMine(
        'user_client',
        { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
        { page: 1, limit: 20 },
      );

      expect(result.data.map((card) => card.id)).toEqual(['p2', 'p1']);
    });
  });
});
