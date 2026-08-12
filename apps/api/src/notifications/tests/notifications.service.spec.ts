import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../services/notifications.service';

function build() {
  const repository = {
    create: jest.fn().mockResolvedValue({ id: 'notification_1' }),
    createMany: jest.fn().mockResolvedValue(1),
    listByRecipient: jest.fn().mockResolvedValue([]),
    countByRecipient: jest.fn().mockResolvedValue(0),
    countUnread: jest.fn().mockResolvedValue(0),
    findById: jest.fn(),
    markRead: jest.fn().mockResolvedValue(1),
    markAllRead: jest.fn().mockResolvedValue(0),
    listSubmittedProviderUserIds: jest.fn().mockResolvedValue([]),
  };

  const service = new NotificationsService(repository as never);

  return { service, repository };
}

const UNREAD = {
  id: 'notification_1',
  recipientUserId: 'user_1',
  type: 'PROPOSAL_SUBMITTED',
  title: 'New proposal received',
  message: 'A provider submitted a proposal for your requirement.',
  data: { jobId: 'job_1', proposalId: 'proposal_1' },
  readAt: null,
  createdAt: new Date(),
};

describe('NotificationsService', () => {
  describe('event creation', () => {
    it('creates a notification with the fixed copy for the event type', async () => {
      const { service, repository } = build();

      await service.proposalAccepted('user_1', { jobId: 'job_1', proposalId: 'proposal_1' });

      expect(repository.create).toHaveBeenCalledWith({
        recipientUserId: 'user_1',
        type: 'PROPOSAL_ACCEPTED',
        title: 'Proposal accepted',
        message: 'Your proposal was accepted by the client.',
        data: { jobId: 'job_1', proposalId: 'proposal_1' },
      });
    });

    it(
      'does not throw when the repository write fails — the business operation that ' +
        'already committed must not fail because of it',
      async () => {
        const { service, repository } = build();
        repository.create.mockRejectedValue(new Error('database unavailable'));

        await expect(
          service.proposalSubmitted('user_1', { jobId: 'job_1', proposalId: 'proposal_1' }),
        ).resolves.toBeUndefined();
      },
    );

    it('notifies both parties on connection establishment', async () => {
      const { service, repository } = build();

      await service.connectionEstablished(['user_1', 'user_2'], {
        connectionId: 'connection_1',
        jobId: 'job_1',
        proposalId: 'proposal_1',
      });

      expect(repository.createMany).toHaveBeenCalledWith(
        ['user_1', 'user_2'],
        'CONNECTION_ESTABLISHED',
        'Connection established',
        'You are now connected with the other party.',
        { connectionId: 'connection_1', jobId: 'job_1', proposalId: 'proposal_1' },
      );
    });

    it('resolves JobCancelled recipients itself, from submitted proposals only', async () => {
      const { service, repository } = build();
      repository.listSubmittedProviderUserIds.mockResolvedValue(['user_3', 'user_4']);

      await service.jobCancelled('job_1');

      expect(repository.listSubmittedProviderUserIds).toHaveBeenCalledWith('job_1');
      expect(repository.createMany).toHaveBeenCalledWith(
        ['user_3', 'user_4'],
        'JOB_CANCELLED',
        'Requirement cancelled',
        'This requirement is no longer accepting proposals.',
        { jobId: 'job_1' },
      );
    });

    it('swallows a failure resolving JobCancelled recipients too', async () => {
      const { service, repository } = build();
      repository.listSubmittedProviderUserIds.mockRejectedValue(new Error('database unavailable'));

      await expect(service.jobCancelled('job_1')).resolves.toBeUndefined();
      expect(repository.createMany).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('marks an unread notification read', async () => {
      const { service, repository } = build();
      repository.findById
        .mockResolvedValueOnce(UNREAD)
        .mockResolvedValueOnce({ ...UNREAD, readAt: new Date() });

      const result = await service.markAsRead('user_1', 'notification_1');

      expect(repository.markRead).toHaveBeenCalledWith('notification_1', 'user_1');
      expect(result.readAt).not.toBeNull();
    });

    it('is idempotent — marking an already-read notification again does not write again', async () => {
      const { service, repository } = build();
      const read = { ...UNREAD, readAt: new Date() };
      repository.findById.mockResolvedValue(read);

      const result = await service.markAsRead('user_1', 'notification_1');

      expect(repository.markRead).not.toHaveBeenCalled();
      expect(result).toEqual(read);
    });

    it('404s for a notification that does not exist', async () => {
      const { service, repository } = build();
      repository.findById.mockResolvedValue(null);

      await expect(service.markAsRead('user_1', 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.markRead).not.toHaveBeenCalled();
    });

    it('403s — not 404s — for another user’s notification', async () => {
      const { service, repository } = build();
      repository.findById.mockResolvedValue(UNREAD);

      await expect(service.markAsRead('someone_else', 'notification_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.markRead).not.toHaveBeenCalled();
    });
  });

  describe('markAllRead', () => {
    it('scopes the bulk update to the authenticated user only', async () => {
      const { service, repository } = build();

      await service.markAllRead('user_1');

      expect(repository.markAllRead).toHaveBeenCalledWith('user_1');
    });
  });

  describe('unreadCount', () => {
    it('reports the recipient-scoped unread count', async () => {
      const { service, repository } = build();
      repository.countUnread.mockResolvedValue(4);

      const result = await service.unreadCount('user_1');

      expect(result).toEqual({ count: 4 });
      expect(repository.countUnread).toHaveBeenCalledWith('user_1');
    });
  });

  describe('list', () => {
    it('paginates the recipient-scoped list', async () => {
      const { service, repository } = build();
      repository.listByRecipient.mockResolvedValue([UNREAD]);
      repository.countByRecipient.mockResolvedValue(1);

      const result = await service.list('user_1', { page: 1, limit: 20 });

      expect(repository.listByRecipient).toHaveBeenCalledWith('user_1', 0, 20);
      expect(repository.countByRecipient).toHaveBeenCalledWith('user_1');
      expect(result.data).toEqual([UNREAD]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      });
    });
  });
});
