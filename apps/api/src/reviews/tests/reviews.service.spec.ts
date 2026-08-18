import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReviewsService } from '../services/reviews.service';

function build() {
  const reviewsRepository = {
    create: jest.fn().mockResolvedValue({ id: 'review_1' }),
    findByConnectionAndReviewer: jest.fn().mockResolvedValue(null),
    listByConnection: jest.fn().mockResolvedValue([]),
    listByProfile: jest.fn().mockResolvedValue([]),
    listByReviewer: jest.fn().mockResolvedValue([]),
    countByConnectionIds: jest.fn().mockResolvedValue(new Map()),
  };
  const connectionsService = {
    findById: jest.fn(),
  };
  const profilesRepository = {
    findByUserId: jest.fn().mockResolvedValue({ id: 'profile_client' }),
    findById: jest.fn().mockResolvedValue({ id: 'profile_client', userId: 'user_client' }),
  };

  const service = new ReviewsService(
    reviewsRepository as never,
    connectionsService as never,
    profilesRepository as never,
  );

  return { service, reviewsRepository, connectionsService, profilesRepository };
}

const completedConnection = {
  id: 'connection_1',
  status: 'COMPLETED',
  clientProfileId: 'profile_client',
  providerProfileId: 'profile_provider',
};

function reviewAt(daysAgo: number, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'review_x',
    connectionId: 'connection_1',
    reviewerUserId: 'user_1',
    revieweeProfileId: 'profile_target',
    rating: 5,
    comment: 'great',
    createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

describe('ReviewsService', () => {
  describe('submit', () => {
    it('reviews the other side — client reviewing resolves the provider as reviewee', async () => {
      const { service, reviewsRepository, connectionsService } = build();
      connectionsService.findById.mockResolvedValue(completedConnection);

      await service.submit('user_client', 'connection_1', 5, 'great work');

      expect(reviewsRepository.create).toHaveBeenCalledWith(
        'connection_1',
        'user_client',
        'profile_provider',
        5,
        'great work',
      );
    });

    it('resolves the client as reviewee when the provider is the one reviewing', async () => {
      const { service, reviewsRepository, connectionsService, profilesRepository } = build();
      profilesRepository.findByUserId.mockResolvedValue({ id: 'profile_provider' });
      connectionsService.findById.mockResolvedValue(completedConnection);

      await service.submit('user_provider', 'connection_1', 4, 'good client');

      expect(reviewsRepository.create).toHaveBeenCalledWith(
        'connection_1',
        'user_provider',
        'profile_client',
        4,
        'good client',
      );
    });

    it('translates a unique-constraint race into a clean 409, not a raw 500', async () => {
      // The pre-check (findByConnectionAndReviewer) is check-then-write, not
      // atomic — two concurrent requests from the same reviewer can both
      // pass it before either commits. This is what the database's own
      // unique constraint on [connectionId, reviewerUserId] catches, and
      // what this test proves gets translated into a ConflictException
      // rather than surfacing Prisma's raw P2002 as an unhandled 500.
      const { service, reviewsRepository, connectionsService } = build();
      connectionsService.findById.mockResolvedValue(completedConnection);
      reviewsRepository.create.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      await expect(service.submit('user_client', 'connection_1', 5, 'x')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses to review a connection that is not COMPLETED', async () => {
      const { service, reviewsRepository, connectionsService } = build();
      connectionsService.findById.mockResolvedValue({ ...completedConnection, status: 'ACTIVE' });

      await expect(service.submit('user_client', 'connection_1', 5, 'x')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(reviewsRepository.create).not.toHaveBeenCalled();
    });

    it('refuses a second review from the same reviewer on the same connection', async () => {
      const { service, reviewsRepository, connectionsService } = build();
      connectionsService.findById.mockResolvedValue(completedConnection);
      reviewsRepository.findByConnectionAndReviewer.mockResolvedValue({ id: 'existing_review' });

      await expect(service.submit('user_client', 'connection_1', 5, 'x')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(reviewsRepository.create).not.toHaveBeenCalled();
    });

    it('propagates ConnectionsService.findById rejecting a non-party — no review is written', async () => {
      const { service, reviewsRepository, connectionsService } = build();
      connectionsService.findById.mockRejectedValue(new Error('not a party'));

      await expect(service.submit('user_stranger', 'connection_1', 5, 'x')).rejects.toThrow();
      expect(reviewsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('myReview', () => {
    it('checks connection membership, then returns the caller’s own review or null', async () => {
      const { service, reviewsRepository, connectionsService } = build();
      connectionsService.findById.mockResolvedValue(completedConnection);
      reviewsRepository.findByConnectionAndReviewer.mockResolvedValue({ id: 'review_1' });

      const result = await service.myReview('user_client', 'connection_1');

      expect(connectionsService.findById).toHaveBeenCalledWith('user_client', 'connection_1');
      expect(reviewsRepository.findByConnectionAndReviewer).toHaveBeenCalledWith(
        'connection_1',
        'user_client',
      );
      expect(result).toEqual({ id: 'review_1' });
    });

    it('propagates the party check — a stranger gets rejected before any review lookup', async () => {
      const { service, reviewsRepository, connectionsService } = build();
      connectionsService.findById.mockRejectedValue(new Error('not a party'));

      await expect(service.myReview('user_stranger', 'connection_1')).rejects.toThrow();
      expect(reviewsRepository.findByConnectionAndReviewer).not.toHaveBeenCalled();
    });
  });

  describe('visibility', () => {
    it('shows a review once both parties have reviewed the same connection', async () => {
      const { service, reviewsRepository } = build();
      reviewsRepository.listByProfile.mockResolvedValue([reviewAt(1)]);
      reviewsRepository.countByConnectionIds.mockResolvedValue(new Map([['connection_1', 2]]));

      const result = await service.listForProfile('profile_target', { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
    });

    it('hides a one-sided review inside the reveal window', async () => {
      const { service, reviewsRepository } = build();
      reviewsRepository.listByProfile.mockResolvedValue([reviewAt(1)]); // 1 day old
      reviewsRepository.countByConnectionIds.mockResolvedValue(new Map([['connection_1', 1]]));

      const result = await service.listForProfile('profile_target', { page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
    });

    it('reveals a one-sided review once the window has elapsed', async () => {
      const { service, reviewsRepository } = build();
      reviewsRepository.listByProfile.mockResolvedValue([reviewAt(15)]); // past the 14-day window
      reviewsRepository.countByConnectionIds.mockResolvedValue(new Map([['connection_1', 1]]));

      const result = await service.listForProfile('profile_target', { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
    });

    it('averages only visible reviews', async () => {
      const { service, reviewsRepository } = build();
      reviewsRepository.listByProfile.mockResolvedValue([
        reviewAt(1, { connectionId: 'c1', rating: 1 }), // hidden — one-sided, within window
        reviewAt(15, { connectionId: 'c2', rating: 5 }), // visible — past window
      ]);
      reviewsRepository.countByConnectionIds.mockResolvedValue(
        new Map([
          ['c1', 1],
          ['c2', 1],
        ]),
      );

      const stats = await service.statsForProfile('profile_target');

      expect(stats).toEqual({ averageRating: 5, reviewCount: 1 });
    });

    it('reports no rating rather than dividing by zero when nothing is visible yet', async () => {
      const { service, reviewsRepository } = build();
      reviewsRepository.listByProfile.mockResolvedValue([reviewAt(1)]);
      reviewsRepository.countByConnectionIds.mockResolvedValue(new Map([['connection_1', 1]]));

      const stats = await service.statsForProfile('profile_target');

      expect(stats).toEqual({ averageRating: null, reviewCount: 0 });
    });
  });

  describe('clientHistory', () => {
    function reviewWrittenBy(daysAgo: number, overrides: Partial<Record<string, unknown>> = {}) {
      return {
        ...reviewAt(daysAgo, overrides),
        reviewerUserId: 'user_client',
        connection: { job: { id: 'job_1', title: 'Wedding photography' } },
        revieweeProfile: { displayName: 'A Provider' },
      };
    }

    it('404s for a profile that does not exist', async () => {
      const { service, profilesRepository } = build();
      profilesRepository.findById.mockResolvedValue(null);

      await expect(service.clientHistory('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('only includes visible reviews the client itself wrote', async () => {
      const { service, reviewsRepository } = build();
      reviewsRepository.listByReviewer.mockResolvedValue([reviewWrittenBy(15)]); // past the window
      reviewsRepository.countByConnectionIds.mockResolvedValue(new Map([['connection_1', 1]]));

      const history = await service.clientHistory('profile_client');

      expect(reviewsRepository.listByReviewer).toHaveBeenCalledWith('user_client');
      expect(history).toEqual([
        {
          jobId: 'job_1',
          jobTitle: 'Wedding photography',
          providerDisplayName: 'A Provider',
          rating: 5,
          comment: 'great',
          createdAt: expect.any(Date),
        },
      ]);
    });

    it('hides a one-sided review inside the reveal window — same rule as listForProfile', async () => {
      const { service, reviewsRepository } = build();
      reviewsRepository.listByReviewer.mockResolvedValue([reviewWrittenBy(1)]); // 1 day old
      reviewsRepository.countByConnectionIds.mockResolvedValue(new Map([['connection_1', 1]]));

      const history = await service.clientHistory('profile_client');

      expect(history).toHaveLength(0);
    });

    it('caps the result at the given limit', async () => {
      const { service, reviewsRepository } = build();
      reviewsRepository.listByReviewer.mockResolvedValue([
        reviewWrittenBy(20, { connectionId: 'c1' }),
        reviewWrittenBy(19, { connectionId: 'c2' }),
        reviewWrittenBy(18, { connectionId: 'c3' }),
      ]);
      reviewsRepository.countByConnectionIds.mockResolvedValue(
        new Map([
          ['c1', 1],
          ['c2', 1],
          ['c3', 1],
        ]),
      );

      const history = await service.clientHistory('profile_client', 2);

      expect(history).toHaveLength(2);
    });
  });
});
