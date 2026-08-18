import { ForbiddenException } from '@nestjs/common';
import { MessagesService } from '../services/messages.service';

function build() {
  const messagesRepository = {
    create: jest.fn().mockResolvedValue({ id: 'message_1' }),
    listByConnection: jest.fn().mockResolvedValue([]),
    countByConnection: jest.fn().mockResolvedValue(0),
    markConnectionRead: jest.fn().mockResolvedValue(0),
    listLatestPerConnection: jest.fn().mockResolvedValue([]),
    countUnreadPerConnection: jest.fn().mockResolvedValue(new Map()),
    countUnreadForConnections: jest.fn().mockResolvedValue(0),
  };
  const connectionsService = {
    findById: jest.fn().mockResolvedValue({ id: 'connection_1' }),
  };
  const connectionsRepository = {
    listIdsByProfile: jest.fn().mockResolvedValue([]),
  };
  const profilesRepository = {
    findByUserId: jest.fn().mockResolvedValue({ id: 'profile_1' }),
  };

  const service = new MessagesService(
    messagesRepository as never,
    connectionsService as never,
    connectionsRepository as never,
    profilesRepository as never,
  );

  return {
    service,
    messagesRepository,
    connectionsService,
    connectionsRepository,
    profilesRepository,
  };
}

describe('MessagesService', () => {
  describe('send', () => {
    it('checks connection membership before writing, and writes as the caller', async () => {
      const { service, messagesRepository, connectionsService } = build();

      await service.send('user_1', 'connection_1', 'hello');

      expect(connectionsService.findById).toHaveBeenCalledWith('user_1', 'connection_1');
      expect(messagesRepository.create).toHaveBeenCalledWith('connection_1', 'user_1', 'hello');
    });

    it('propagates ConnectionsService.findById rejecting a non-party — no message is written', async () => {
      const { service, messagesRepository, connectionsService } = build();
      connectionsService.findById.mockRejectedValue(new ForbiddenException());

      await expect(service.send('user_2', 'connection_1', 'hello')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(messagesRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    it('only ever marks the other party’s messages, scoped by the reader', async () => {
      const { service, messagesRepository } = build();

      await service.markRead('user_1', 'connection_1');

      expect(messagesRepository.markConnectionRead).toHaveBeenCalledWith('connection_1', 'user_1');
    });
  });

  describe('previews', () => {
    it('pairs each connection with its last message and unread count', async () => {
      const { service, messagesRepository, connectionsRepository } = build();
      connectionsRepository.listIdsByProfile.mockResolvedValue(['connection_1', 'connection_2']);
      messagesRepository.listLatestPerConnection.mockResolvedValue([
        { id: 'message_1', connectionId: 'connection_1', body: 'hi' },
      ]);
      messagesRepository.countUnreadPerConnection.mockResolvedValue(new Map([['connection_1', 2]]));

      const result = await service.previews('user_1');

      expect(result).toEqual([
        {
          connectionId: 'connection_1',
          lastMessage: { id: 'message_1', connectionId: 'connection_1', body: 'hi' },
          unreadCount: 2,
        },
        { connectionId: 'connection_2', lastMessage: null, unreadCount: 0 },
      ]);
    });
  });
});
