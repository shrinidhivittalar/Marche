import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../services/users.service';
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

describe('UsersService', () => {
  let usersRepository: jest.Mocked<UsersRepository>;
  let usersService: UsersService;

  beforeEach(() => {
    usersRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    usersService = new UsersService(usersRepository);
  });

  it('returns the public shape of an existing, non-deleted user', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ emailVerifiedAt: new Date() }));

    const result = await usersService.getById('user_1');

    expect(result).toEqual({
      id: 'user_1',
      email: 'jane@example.com',
      name: 'Jane',
      role: 'CLIENT',
      emailVerified: true,
    });
  });

  it('throws NotFoundException when the user does not exist', async () => {
    usersRepository.findById.mockResolvedValue(null);

    await expect(usersService.getById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException for a soft-deleted user', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ deletedAt: new Date() }));

    await expect(usersService.getById('user_1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
