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
    listAttachments: jest.fn().mockResolvedValue([]),
    addAttachment: jest.fn().mockResolvedValue({ id: 'attachment_1' }),
    removeAttachment: jest.fn().mockResolvedValue({ count: 1 }),
    countAttachments: jest.fn().mockResolvedValue(0),
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
  const mediaService = {
    assertAttachable: jest.fn().mockResolvedValue(undefined),
    markPrivate: jest.fn().mockResolvedValue(undefined),
    signViewUrl: jest.fn().mockResolvedValue('https://signed.example/file'),
  };

  const service = new DisputesService(
    disputesRepository as never,
    connectionsService as never,
    profilesRepository as never,
    notificationsService as never,
    mediaService as never,
  );

  return {
    service,
    disputesRepository,
    connectionsService,
    profilesRepository,
    notificationsService,
    mediaService,
  };
}

const partyDispute = {
  id: 'dispute_1',
  raisedByUserId: 'user_client',
  raisedAgainstUserId: 'user_provider',
};

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

  describe('attachEvidence', () => {
    it('attaches a file for a party to the dispute', async () => {
      const { service, disputesRepository, mediaService } = build();
      disputesRepository.findById.mockResolvedValue(partyDispute);

      await service.attachEvidence('user_client', 'dispute_1', 'media_1');

      expect(mediaService.assertAttachable).toHaveBeenCalledWith('user_client', 'media_1');
      expect(mediaService.markPrivate).toHaveBeenCalledWith('media_1');
      expect(disputesRepository.addAttachment).toHaveBeenCalledWith('dispute_1', 'media_1', 0);
    });

    it('refuses a caller who is not a party to the dispute', async () => {
      const { service, disputesRepository } = build();
      disputesRepository.findById.mockResolvedValue(partyDispute);

      await expect(
        service.attachEvidence('user_stranger', 'dispute_1', 'media_1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s for a dispute that does not exist', async () => {
      const { service, disputesRepository } = build();
      disputesRepository.findById.mockResolvedValue(null);

      await expect(
        service.attachEvidence('user_client', 'missing', 'media_1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a party once the attachment cap is reached', async () => {
      const { service, disputesRepository } = build();
      disputesRepository.findById.mockResolvedValue(partyDispute);
      disputesRepository.countAttachments.mockResolvedValue(10);

      await expect(service.attachEvidence('user_client', 'dispute_1', 'media_1')).rejects.toThrow(
        'A dispute can have at most 10 attachments',
      );
      expect(disputesRepository.addAttachment).not.toHaveBeenCalled();
    });
  });

  describe('removeEvidence', () => {
    it('removes an attachment for a party to the dispute', async () => {
      const { service, disputesRepository } = build();
      disputesRepository.findById.mockResolvedValue(partyDispute);

      await service.removeEvidence('user_provider', 'dispute_1', 'attachment_1');

      expect(disputesRepository.removeAttachment).toHaveBeenCalledWith('dispute_1', 'attachment_1');
    });

    it('404s when the attachment does not belong to this dispute', async () => {
      const { service, disputesRepository } = build();
      disputesRepository.findById.mockResolvedValue(partyDispute);
      disputesRepository.removeAttachment.mockResolvedValue({ count: 0 });

      await expect(
        service.removeEvidence('user_client', 'dispute_1', 'attachment_1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listEvidence', () => {
    it('checks party membership for a non-admin caller', async () => {
      const { service, disputesRepository } = build();
      disputesRepository.findById.mockResolvedValue(partyDispute);

      await service.listEvidence('user_client', 'CLIENT', 'dispute_1');

      expect(disputesRepository.findById).toHaveBeenCalledWith('dispute_1');
    });

    it('refuses a non-party, non-admin caller', async () => {
      const { service, disputesRepository } = build();
      disputesRepository.findById.mockResolvedValue(partyDispute);

      await expect(
        service.listEvidence('user_stranger', 'CLIENT', 'dispute_1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows an admin who is not a party', async () => {
      const { service, disputesRepository } = build();
      disputesRepository.findById.mockResolvedValue(partyDispute);

      await expect(service.listEvidence('user_admin', 'ADMIN', 'dispute_1')).resolves.not.toThrow();
    });

    it('maps attachments to signed urls, dropping the raw media object', async () => {
      const { service, disputesRepository, mediaService } = build();
      disputesRepository.findById.mockResolvedValue(partyDispute);
      disputesRepository.listAttachments.mockResolvedValue([
        {
          id: 'attachment_1',
          displayOrder: 0,
          mediaId: 'media_1',
          media: {
            objectKey: 'k',
            status: 'UPLOADED',
            originalFileName: 'evidence.png',
            mimeType: 'image/png',
          },
        },
      ]);

      const result = await service.listEvidence('user_client', 'CLIENT', 'dispute_1');

      expect(result).toEqual([
        {
          id: 'attachment_1',
          displayOrder: 0,
          mediaId: 'media_1',
          fileName: 'evidence.png',
          mimeType: 'image/png',
          url: 'https://signed.example/file',
        },
      ]);
      expect(mediaService.signViewUrl).toHaveBeenCalled();
    });
  });
});
