import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DisputesService } from '../services/disputes.service';

function build() {
  const disputesRepository = {
    create: jest.fn().mockResolvedValue({ id: 'dispute_1' }),
    findById: jest.fn(),
    findActiveForConnection: jest.fn().mockResolvedValue(null),
    listForConnection: jest.fn().mockResolvedValue([]),
    resolve: jest.fn().mockResolvedValue({ id: 'dispute_1', status: 'RESOLVED' }),
    listAll: jest.fn().mockResolvedValue([]),
    countAll: jest.fn().mockResolvedValue(0),
  };
  const connectionsService = {
    findById: jest.fn().mockResolvedValue({
      id: 'connection_1',
      clientProfileId: 'profile_client',
      providerProfileId: 'profile_provider',
    }),
  };
  const profilesRepository = {
    findByUserId: jest.fn().mockResolvedValue({ id: 'profile_client' }),
    findById: jest.fn().mockResolvedValue({ id: 'profile_provider', userId: 'user_provider' }),
  };
  const notificationsService = {
    disputeRaised: jest.fn().mockResolvedValue(undefined),
  };

  const service = new DisputesService(
    disputesRepository as never,
    connectionsService as never,
    profilesRepository as never,
    notificationsService as never,
  );

  return {
    service,
    disputesRepository,
    connectionsService,
    profilesRepository,
    notificationsService,
  };
}

describe('DisputesService', () => {
  describe('raise', () => {
    it('creates the dispute against the other party and notifies them', async () => {
      const { service, disputesRepository, notificationsService } = build();

      await service.raise(
        'user_client',
        'connection_1',
        'a genuine reason here',
        'some evidence here',
      );

      expect(disputesRepository.create).toHaveBeenCalledWith(
        'connection_1',
        'user_client',
        'user_provider',
        'a genuine reason here',
        'some evidence here',
      );
      expect(notificationsService.disputeRaised).toHaveBeenCalledWith('user_provider', {
        connectionId: 'connection_1',
        disputeId: 'dispute_1',
      });
    });

    it('resolves the client as "the other party" when the provider is the one raising it', async () => {
      const { service, disputesRepository, profilesRepository } = build();
      profilesRepository.findByUserId.mockResolvedValue({ id: 'profile_provider' });
      profilesRepository.findById.mockResolvedValue({
        id: 'profile_client',
        userId: 'user_client',
      });

      await service.raise(
        'user_provider',
        'connection_1',
        'a genuine reason here',
        'some evidence here',
      );

      expect(disputesRepository.create).toHaveBeenCalledWith(
        'connection_1',
        'user_provider',
        'user_client',
        'a genuine reason here',
        'some evidence here',
      );
    });

    it('refuses a second active dispute on the same connection', async () => {
      const { service, disputesRepository } = build();
      disputesRepository.findActiveForConnection.mockResolvedValue({ id: 'existing' });

      await expect(
        service.raise('user_client', 'connection_1', 'a genuine reason here', 'some evidence here'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(disputesRepository.create).not.toHaveBeenCalled();
    });

    it('propagates the party check — a stranger cannot raise a dispute', async () => {
      const { service, disputesRepository, connectionsService } = build();
      connectionsService.findById.mockRejectedValue(new ForbiddenException());

      await expect(
        service.raise(
          'user_stranger',
          'connection_1',
          'a genuine reason here',
          'some evidence here',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(disputesRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('listForConnection', () => {
    it('checks party membership for a non-admin caller', async () => {
      const { service, connectionsService } = build();

      await service.listForConnection('user_client', 'CLIENT', 'connection_1');

      expect(connectionsService.findById).toHaveBeenCalledWith('user_client', 'connection_1');
    });

    it('skips the party check for an admin', async () => {
      const { service, connectionsService } = build();

      await service.listForConnection('user_admin', 'ADMIN', 'connection_1');

      expect(connectionsService.findById).not.toHaveBeenCalled();
    });
  });

  describe('listAll', () => {
    it('refuses anyone who is not an admin', async () => {
      const { service } = build();

      await expect(service.listAll('CLIENT', { page: 1, limit: 20 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    // Module 1 closeout fix: this used to check the caller's legacy
    // User.role, which never becomes 'ADMIN' for anyone promoted through
    // Slice 6's PATCH /admin/users/:id/platform-role — only platformRole
    // does. SUPER_ADMIN must pass too, as a strict superset of ADMIN.
    it('allows a SUPER_ADMIN', async () => {
      const { service, disputesRepository } = build();

      await service.listAll('SUPER_ADMIN', { page: 1, limit: 20 });

      expect(disputesRepository.listAll).toHaveBeenCalled();
    });
  });

  describe('resolve', () => {
    it('refuses anyone who is not an admin', async () => {
      const { service } = build();

      await expect(
        service.resolve('CLIENT', 'dispute_1', 'user_client', 'refunded'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s for a dispute that does not exist', async () => {
      const { service, disputesRepository } = build();
      disputesRepository.findById.mockResolvedValue(null);

      await expect(
        service.resolve('ADMIN', 'missing', 'user_admin', 'refunded'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolves an open dispute', async () => {
      const { service, disputesRepository } = build();
      disputesRepository.findById.mockResolvedValue({ id: 'dispute_1', status: 'OPEN' });

      const result = await service.resolve('ADMIN', 'dispute_1', 'user_admin', 'refunded');

      expect(disputesRepository.resolve).toHaveBeenCalledWith(
        'dispute_1',
        'user_admin',
        'refunded',
      );
      expect(result.status).toBe('RESOLVED');
    });

    it('is idempotent — resolving an already-resolved dispute returns it unchanged', async () => {
      const { service, disputesRepository } = build();
      const resolved = { id: 'dispute_1', status: 'RESOLVED' };
      disputesRepository.findById.mockResolvedValue(resolved);

      const result = await service.resolve('ADMIN', 'dispute_1', 'user_admin', 'refunded');

      expect(result).toBe(resolved);
      expect(disputesRepository.resolve).not.toHaveBeenCalled();
    });
  });
});
