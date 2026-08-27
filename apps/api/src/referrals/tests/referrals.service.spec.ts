import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ReferralsService } from '../services/referrals.service';

function build() {
  const referralsRepository = {
    create: jest.fn(),
    find: jest.fn().mockResolvedValue(null),
    listByReferrer: jest.fn().mockResolvedValue([]),
    countByReferrer: jest.fn().mockResolvedValue(0),
    markJoined: jest.fn().mockResolvedValue(0),
  };
  const profilesRepository = {
    findByUserId: jest
      .fn()
      .mockResolvedValue({ id: 'profile_1', displayName: 'Priya', user: { role: 'CLIENT' } }),
  };
  const emailService = {
    sendReferralInviteEmail: jest.fn().mockResolvedValue(undefined),
  };

  const service = new ReferralsService(
    referralsRepository as never,
    profilesRepository as never,
    emailService as never,
  );

  return { service, referralsRepository, profilesRepository, emailService };
}

const DTO = { name: 'Ravi', email: 'ravi@example.com', specialty: 'Catering', note: 'Great chef' };

describe('ReferralsService', () => {
  describe('create', () => {
    it('creates the referral and sends a real invite email', async () => {
      const { service, referralsRepository, emailService } = build();
      referralsRepository.create.mockResolvedValue({ id: 'referral_1', ...DTO });

      const result = await service.create(
        'user_1',
        { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
        DTO,
      );

      expect(referralsRepository.create).toHaveBeenCalledWith({
        referrerProfileId: 'profile_1',
        name: 'Ravi',
        email: 'ravi@example.com',
        specialty: 'Catering',
        note: 'Great chef',
      });
      expect(emailService.sendReferralInviteEmail).toHaveBeenCalledWith(
        'ravi@example.com',
        'Priya',
        'Great chef',
      );
      expect(result.id).toBe('referral_1');
    });

    it('rejects a non-client caller', async () => {
      const { service, profilesRepository } = build();
      profilesRepository.findByUserId.mockResolvedValue({
        id: 'profile_1',
        displayName: 'Priya',
        user: { role: 'PROVIDER' },
      });

      await expect(service.create('user_1', { role: 'PROVIDER' }, DTO)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('409s on a pre-existing referral for the same email, without sending a second email', async () => {
      const { service, referralsRepository, emailService } = build();
      referralsRepository.find.mockResolvedValue({ id: 'referral_1' });

      await expect(
        service.create('user_1', { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] }, DTO),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(referralsRepository.create).not.toHaveBeenCalled();
      expect(emailService.sendReferralInviteEmail).not.toHaveBeenCalled();
    });

    it('409s on a race — the pre-check passed but the write hit the unique constraint', async () => {
      const { service, referralsRepository } = build();
      referralsRepository.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create('user_1', { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] }, DTO),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates an unrelated write failure as-is', async () => {
      const { service, referralsRepository } = build();
      const dbError = new Error('database unavailable');
      referralsRepository.create.mockRejectedValue(dbError);

      await expect(
        service.create('user_1', { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] }, DTO),
      ).rejects.toBe(dbError);
    });
  });

  describe('listMine', () => {
    it('rejects a non-client caller', async () => {
      const { service, profilesRepository } = build();
      profilesRepository.findByUserId.mockResolvedValue({
        id: 'profile_1',
        displayName: 'Priya',
        user: { role: 'PROVIDER' },
      });

      await expect(
        service.listMine('user_1', { role: 'PROVIDER' }, { page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('paginates the referrer-scoped list', async () => {
      const { service, referralsRepository } = build();
      referralsRepository.listByReferrer.mockResolvedValue([{ id: 'referral_1' }]);
      referralsRepository.countByReferrer.mockResolvedValue(1);

      const result = await service.listMine(
        'user_1',
        { role: 'CLIENT', capabilities: [{ capability: 'CLIENT' }] },
        { page: 1, limit: 20 },
      );

      expect(referralsRepository.listByReferrer).toHaveBeenCalledWith('profile_1', 0, 20);
      expect(result.data).toEqual([{ id: 'referral_1' }]);
    });
  });

  describe('handleUserJoined', () => {
    it('marks matching referrals joined', async () => {
      const { service, referralsRepository } = build();

      await service.handleUserJoined('ravi@example.com');

      expect(referralsRepository.markJoined).toHaveBeenCalledWith('ravi@example.com');
    });

    it('swallows a failure — a bookkeeping miss must never fail registration', async () => {
      const { service, referralsRepository } = build();
      referralsRepository.markJoined.mockRejectedValue(new Error('database unavailable'));

      await expect(service.handleUserJoined('ravi@example.com')).resolves.toBeUndefined();
    });
  });
});
