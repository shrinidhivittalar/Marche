import { VerificationsRepository } from '../repositories/verifications.repository';
import type { PrismaService } from '../../prisma/prisma.service';

describe('VerificationsRepository.upsertEmailVerified', () => {
  let verification: { upsert: jest.Mock };
  let prismaService: jest.Mocked<PrismaService>;
  let repository: VerificationsRepository;

  beforeEach(() => {
    verification = { upsert: jest.fn() };
    prismaService = { client: { verification } } as unknown as jest.Mocked<PrismaService>;
    repository = new VerificationsRepository(prismaService);
  });

  it('upserts on (userId, type) so a retry is a safe no-op rather than a duplicate row', async () => {
    const verifiedAt = new Date('2026-01-01');
    verification.upsert.mockResolvedValue({ id: 'v1' });

    await repository.upsertEmailVerified('user_1', verifiedAt);

    expect(verification.upsert).toHaveBeenCalledWith({
      where: { userId_type: { userId: 'user_1', type: 'EMAIL' } },
      create: { userId: 'user_1', type: 'EMAIL', status: 'VERIFIED', verifiedAt },
      update: { status: 'VERIFIED', verifiedAt },
    });
  });

  it('runs inside the given transaction client when one is passed', async () => {
    const txVerification = { upsert: jest.fn().mockResolvedValue({ id: 'v1' }) };
    const tx = { verification: txVerification } as never;

    await repository.upsertEmailVerified('user_1', new Date(), tx);

    expect(txVerification.upsert).toHaveBeenCalled();
    expect(verification.upsert).not.toHaveBeenCalled();
  });
});
