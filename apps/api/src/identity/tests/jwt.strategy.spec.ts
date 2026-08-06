import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../strategies/jwt.strategy';
import type { UsersRepository } from '../repositories/users.repository';
import type { User } from '@marche/db';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_1',
    email: 'jane@example.com',
    passwordHash: 'hashed',
    name: 'Jane',
    role: 'CLIENT',
    status: 'ACTIVE',
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as User;
}

describe('JwtStrategy', () => {
  const originalSecret = process.env.JWT_ACCESS_SECRET;
  let usersRepository: jest.Mocked<UsersRepository>;
  let strategy: JwtStrategy;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.JWT_ACCESS_SECRET = originalSecret;
  });

  beforeEach(() => {
    usersRepository = { findById: jest.fn() } as unknown as jest.Mocked<UsersRepository>;
    strategy = new JwtStrategy(usersRepository);
  });

  it('resolves an authenticated user for an active account', async () => {
    usersRepository.findById.mockResolvedValue(buildUser());

    const result = await strategy.validate({ sub: 'user_1', role: 'CLIENT' });

    expect(result).toEqual({ id: 'user_1', email: 'jane@example.com', name: 'Jane', role: 'CLIENT' });
  });

  it('rejects a token for a user that no longer exists', async () => {
    usersRepository.findById.mockResolvedValue(null);

    await expect(strategy.validate({ sub: 'user_1', role: 'CLIENT' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token for a suspended account', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ status: 'SUSPENDED' }));

    await expect(strategy.validate({ sub: 'user_1', role: 'CLIENT' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token for a soft-deleted account', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ deletedAt: new Date() }));

    await expect(strategy.validate({ sub: 'user_1', role: 'CLIENT' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
