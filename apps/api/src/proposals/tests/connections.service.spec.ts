import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConnectionsService } from '../services/connections.service';

function build() {
  const connectionsRepository = {
    findById: jest.fn(),
    listByProfile: jest.fn().mockResolvedValue([]),
    countByProfile: jest.fn().mockResolvedValue(0),
    markCompleted: jest.fn(),
    sweepAutoComplete: jest.fn().mockResolvedValue(undefined),
    listActiveDatesForProvider: jest.fn().mockResolvedValue([]),
  };
  const proposalsRepository = {
    listSubmittedDatesForProvider: jest.fn().mockResolvedValue([]),
  };
  const profilesRepository = {
    findByUserId: jest.fn().mockResolvedValue({ id: 'profile_client', user: { role: 'CLIENT' } }),
  };

  const service = new ConnectionsService(
    connectionsRepository as never,
    proposalsRepository as never,
    profilesRepository as never,
  );

  return { service, connectionsRepository, proposalsRepository, profilesRepository };
}

const PAST_EVENT = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
const FUTURE_EVENT = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow

function activeConnection(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'connection_1',
    status: 'ACTIVE',
    completedAt: null,
    clientProfileId: 'profile_client',
    providerProfileId: 'profile_provider',
    job: { eventDate: PAST_EVENT },
    ...overrides,
  };
}

describe('ConnectionsService', () => {
  describe('listMine / findById', () => {
    it('sweeps auto-completion before reading, so status is never stale', async () => {
      const { service, connectionsRepository } = build();
      connectionsRepository.findById.mockResolvedValue(activeConnection());

      await service.listMine('user_1', { page: 1, limit: 20 });
      await service.findById('user_1', 'connection_1');

      expect(connectionsRepository.sweepAutoComplete).toHaveBeenCalledTimes(2);
    });
  });

  describe('confirmComplete', () => {
    it('completes when the caller is the client and the event date has passed', async () => {
      const { service, connectionsRepository } = build();
      connectionsRepository.findById.mockResolvedValue(activeConnection());
      connectionsRepository.markCompleted.mockResolvedValue(
        activeConnection({ status: 'COMPLETED' }),
      );

      const result = await service.confirmComplete('user_1', 'connection_1');

      expect(connectionsRepository.markCompleted).toHaveBeenCalledWith('connection_1');
      expect(result.status).toBe('COMPLETED');
    });

    it('rejects the provider — only the client may confirm', async () => {
      const { service, connectionsRepository, profilesRepository } = build();
      profilesRepository.findByUserId.mockResolvedValue({ id: 'profile_provider' });
      connectionsRepository.findById.mockResolvedValue(activeConnection());

      await expect(service.confirmComplete('user_2', 'connection_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(connectionsRepository.markCompleted).not.toHaveBeenCalled();
    });

    it('rejects a caller who is not a party at all', async () => {
      const { service, connectionsRepository, profilesRepository } = build();
      profilesRepository.findByUserId.mockResolvedValue({ id: 'profile_stranger' });
      connectionsRepository.findById.mockResolvedValue(activeConnection());

      await expect(service.confirmComplete('user_3', 'connection_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('404s for a connection that does not exist', async () => {
      const { service, connectionsRepository } = build();
      connectionsRepository.findById.mockResolvedValue(null);

      await expect(service.confirmComplete('user_1', 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses to confirm before the event date', async () => {
      const { service, connectionsRepository } = build();
      connectionsRepository.findById.mockResolvedValue(
        activeConnection({ job: { eventDate: FUTURE_EVENT } }),
      );

      await expect(service.confirmComplete('user_1', 'connection_1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(connectionsRepository.markCompleted).not.toHaveBeenCalled();
    });

    it('refuses to confirm when the job has no event date', async () => {
      const { service, connectionsRepository } = build();
      connectionsRepository.findById.mockResolvedValue(
        activeConnection({ job: { eventDate: null } }),
      );

      await expect(service.confirmComplete('user_1', 'connection_1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('is idempotent — an already-completed connection is returned unchanged, not re-written', async () => {
      const { service, connectionsRepository } = build();
      const completed = activeConnection({ status: 'COMPLETED', completedAt: PAST_EVENT });
      connectionsRepository.findById.mockResolvedValue(completed);

      const result = await service.confirmComplete('user_1', 'connection_1');

      expect(result).toBe(completed);
      expect(connectionsRepository.markCompleted).not.toHaveBeenCalled();
    });
  });

  describe('myCalendar', () => {
    it('rejects a client — the calendar is provider-only', async () => {
      const { service, profilesRepository } = build();
      profilesRepository.findByUserId.mockResolvedValue({
        id: 'profile_client',
        user: { role: 'CLIENT' },
      });

      await expect(service.myCalendar('user_1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('marks a date CONFIRMED even if it also has a pending proposal, since a booked date wins', async () => {
      const { service, connectionsRepository, proposalsRepository, profilesRepository } = build();
      profilesRepository.findByUserId.mockResolvedValue({
        id: 'profile_provider',
        user: { role: 'PROVIDER' },
      });
      proposalsRepository.listSubmittedDatesForProvider.mockResolvedValue([
        { id: 'proposal_1', job: { id: 'job_1', title: 'Same-day pitch', eventDate: PAST_EVENT } },
        {
          id: 'proposal_2',
          job: { id: 'job_2', title: 'Pending only', eventDate: FUTURE_EVENT },
        },
      ]);
      connectionsRepository.listActiveDatesForProvider.mockResolvedValue([
        {
          id: 'connection_1',
          job: { id: 'job_3', title: 'Booked already', eventDate: PAST_EVENT },
        },
      ]);

      const result = await service.myCalendar('user_1');

      const past = result.find((entry) => entry.date === PAST_EVENT.toISOString().slice(0, 10));
      const future = result.find((entry) => entry.date === FUTURE_EVENT.toISOString().slice(0, 10));
      expect(past).toMatchObject({ status: 'CONFIRMED', jobId: 'job_3' });
      expect(future).toMatchObject({ status: 'PENDING', jobId: 'job_2' });
    });
  });
});
