import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../strategies/jwt.strategy';
import type { UserWithCapabilities } from '../repositories/users.repository';
import type { UsersRepository } from '../repositories/users.repository';

function buildUser(overrides: Partial<UserWithCapabilities> = {}): UserWithCapabilities {
  return {
    id: 'user_1',
    email: 'jane@example.com',
    passwordHash: 'hashed',
    name: 'Jane',
    role: 'CLIENT',
    platformRole: 'USER',
    status: 'ACTIVE',
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    capabilities: [],
    ...overrides,
  } as UserWithCapabilities;
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

    expect(result).toEqual({
      id: 'user_1',
      email: 'jane@example.com',
      name: 'Jane',
      role: 'CLIENT',
      platformRole: 'USER',
      capabilities: [],
    });
  });

  it('loads capabilities fresh from the database, flattened from the raw relation rows', async () => {
    usersRepository.findById.mockResolvedValue(
      buildUser({
        capabilities: [
          {
            id: 'cap_1',
            userId: 'user_1',
            capability: 'CLIENT',
            activatedAt: new Date(),
            createdAt: new Date(),
          },
          {
            id: 'cap_2',
            userId: 'user_1',
            capability: 'PROVIDER',
            activatedAt: new Date(),
            createdAt: new Date(),
          },
        ],
      }),
    );

    const result = await strategy.validate({ sub: 'user_1', role: 'CLIENT' });

    expect(result.capabilities).toEqual(['CLIENT', 'PROVIDER']);
  });

  it('resolves platformRole from the database, never from the JWT payload', async () => {
    // The payload here carries no platformRole at all (JwtPayload only has
    // sub/role) — this asserts the returned value came from the DB lookup,
    // not something echoed back from the token.
    usersRepository.findById.mockResolvedValue(buildUser({ platformRole: 'SUPER_ADMIN' }));

    const result = await strategy.validate({ sub: 'user_1', role: 'CLIENT' });

    expect(result.platformRole).toBe('SUPER_ADMIN');
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
