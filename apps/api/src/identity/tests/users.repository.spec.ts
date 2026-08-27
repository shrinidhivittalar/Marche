import { UsersRepository } from '../repositories/users.repository';
import type { PrismaService } from '../../prisma/prisma.service';

function uniqueViolation() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

describe('UsersRepository.grantCapability', () => {
  let userCapability: {
    create: jest.Mock;
    findUnique: jest.Mock;
  };
  let prismaService: jest.Mocked<PrismaService>;
  let usersRepository: UsersRepository;

  beforeEach(() => {
    userCapability = {
      create: jest.fn(),
      findUnique: jest.fn(),
    };
    prismaService = {
      client: { userCapability },
    } as unknown as jest.Mocked<PrismaService>;
    usersRepository = new UsersRepository(prismaService);
  });

  it('creates the row on first grant', async () => {
    const row = { id: 'cap_1', userId: 'user_1', capability: 'CLIENT' };
    userCapability.create.mockResolvedValue(row);

    const result = await usersRepository.grantCapability('user_1', 'CLIENT');

    expect(result).toEqual(row);
    expect(userCapability.findUnique).not.toHaveBeenCalled();
  });

  it('is idempotent: a retried grant returns the existing row instead of throwing', async () => {
    userCapability.create.mockRejectedValue(uniqueViolation());
    const existing = { id: 'cap_1', userId: 'user_1', capability: 'CLIENT' };
    userCapability.findUnique.mockResolvedValue(existing);

    const result = await usersRepository.grantCapability('user_1', 'CLIENT');

    expect(result).toEqual(existing);
    expect(userCapability.findUnique).toHaveBeenCalledWith({
      where: { userId_capability: { userId: 'user_1', capability: 'CLIENT' } },
    });
  });

  it('rethrows a non-unique-violation error unchanged', async () => {
    userCapability.create.mockRejectedValue(new Error('connection lost'));

    await expect(usersRepository.grantCapability('user_1', 'CLIENT')).rejects.toThrow(
      'connection lost',
    );
    expect(userCapability.findUnique).not.toHaveBeenCalled();
  });

  it('rethrows the original error if the unique-violation row is somehow not found', async () => {
    const violation = uniqueViolation();
    userCapability.create.mockRejectedValue(violation);
    userCapability.findUnique.mockResolvedValue(null);

    await expect(usersRepository.grantCapability('user_1', 'CLIENT')).rejects.toBe(violation);
  });
});

describe('UsersRepository — platform-role admin operations', () => {
  let user: { count: jest.Mock; updateMany: jest.Mock };
  let prismaService: jest.Mocked<PrismaService>;
  let usersRepository: UsersRepository;

  beforeEach(() => {
    user = { count: jest.fn(), updateMany: jest.fn() };
    prismaService = { client: { user } } as unknown as jest.Mocked<PrismaService>;
    usersRepository = new UsersRepository(prismaService);
  });

  it('countByPlatformRole counts only non-deleted users with that role', async () => {
    user.count.mockResolvedValue(2);

    const result = await usersRepository.countByPlatformRole('SUPER_ADMIN');

    expect(result).toBe(2);
    expect(user.count).toHaveBeenCalledWith({
      where: { platformRole: 'SUPER_ADMIN', deletedAt: null },
    });
  });

  it('updatePlatformRoleIfCurrent conditions the write on the expected current role', async () => {
    user.updateMany.mockResolvedValue({ count: 1 });

    const result = await usersRepository.updatePlatformRoleIfCurrent('user_1', 'USER', 'ADMIN');

    expect(result).toBe(1);
    expect(user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user_1', platformRole: 'USER' },
      data: { platformRole: 'ADMIN' },
    });
  });

  it('updatePlatformRoleIfCurrent returns 0 when the row already moved on', async () => {
    user.updateMany.mockResolvedValue({ count: 0 });

    const result = await usersRepository.updatePlatformRoleIfCurrent('user_1', 'USER', 'ADMIN');

    expect(result).toBe(0);
  });
});
