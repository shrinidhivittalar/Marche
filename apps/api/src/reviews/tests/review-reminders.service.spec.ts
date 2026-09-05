import { ReviewRemindersService } from '../services/review-reminders.service';

function build() {
  const connectionsRepository = {
    findCompletedForReviewReminder: jest.fn().mockResolvedValue([]),
  };
  const reviewsRepository = {
    findByConnectionAndReviewer: jest.fn().mockResolvedValue(null),
  };
  const notificationsService = {
    reviewReminder: jest.fn().mockResolvedValue(undefined),
  };

  const service = new ReviewRemindersService(
    connectionsRepository as never,
    reviewsRepository as never,
    notificationsService as never,
  );

  return { service, connectionsRepository, reviewsRepository, notificationsService };
}

const connection = {
  id: 'connection_1',
  clientProfile: { userId: 'user_client' },
  providerProfile: { userId: 'user_provider' },
};

describe('ReviewRemindersService', () => {
  describe('sendReminders', () => {
    it('reminds both parties when neither has reviewed', async () => {
      const { service, connectionsRepository, notificationsService } = build();
      connectionsRepository.findCompletedForReviewReminder.mockResolvedValue([connection]);

      await service.sendReminders();

      expect(notificationsService.reviewReminder).toHaveBeenCalledWith('user_client', {
        connectionId: 'connection_1',
      });
      expect(notificationsService.reviewReminder).toHaveBeenCalledWith('user_provider', {
        connectionId: 'connection_1',
      });
      expect(notificationsService.reviewReminder).toHaveBeenCalledTimes(2);
    });

    it('skips a party who has already reviewed', async () => {
      const { service, connectionsRepository, reviewsRepository, notificationsService } = build();
      connectionsRepository.findCompletedForReviewReminder.mockResolvedValue([connection]);
      reviewsRepository.findByConnectionAndReviewer.mockImplementation(
        (_connectionId: string, userId: string) =>
          Promise.resolve(userId === 'user_client' ? { id: 'review_1' } : null),
      );

      await service.sendReminders();

      expect(notificationsService.reviewReminder).toHaveBeenCalledTimes(1);
      expect(notificationsService.reviewReminder).toHaveBeenCalledWith('user_provider', {
        connectionId: 'connection_1',
      });
    });

    it('sends nothing when both parties have already reviewed', async () => {
      const { service, connectionsRepository, reviewsRepository, notificationsService } = build();
      connectionsRepository.findCompletedForReviewReminder.mockResolvedValue([connection]);
      reviewsRepository.findByConnectionAndReviewer.mockResolvedValue({ id: 'review_1' });

      await service.sendReminders();

      expect(notificationsService.reviewReminder).not.toHaveBeenCalled();
    });

    it('queries a one-day window ending REMINDER_DELAY_DAYS ago', async () => {
      const { service, connectionsRepository } = build();

      await service.sendReminders();

      const [windowStart, windowEnd] =
        connectionsRepository.findCompletedForReviewReminder.mock.calls[0];
      expect(windowEnd.getTime() - windowStart.getTime()).toBe(24 * 60 * 60 * 1000);
      const daysAgo = (Date.now() - windowEnd.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysAgo).toBeCloseTo(3, 1);
    });

    it('does not let one connection failing block the others', async () => {
      const { service, connectionsRepository, notificationsService } = build();
      const other = {
        id: 'connection_2',
        clientProfile: { userId: 'user_client_2' },
        providerProfile: { userId: 'user_provider_2' },
      };
      connectionsRepository.findCompletedForReviewReminder.mockResolvedValue([connection, other]);
      notificationsService.reviewReminder.mockImplementation((userId: string) =>
        userId === 'user_client' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined),
      );

      await service.sendReminders();

      expect(notificationsService.reviewReminder).toHaveBeenCalledWith('user_client_2', {
        connectionId: 'connection_2',
      });
      expect(notificationsService.reviewReminder).toHaveBeenCalledWith('user_provider_2', {
        connectionId: 'connection_2',
      });
    });
  });
});
