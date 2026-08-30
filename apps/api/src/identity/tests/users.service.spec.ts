import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../services/users.service';
import type { UsersRepository, UserWithCapabilities } from '../repositories/users.repository';
import type { Capability } from '@marche/db';

// Capability rows as the repository returns them (findById includes the
// relation) — toPublicUser maps these to the flat array the API exposes.
function capabilityRows(capabilities: Capability[]) {
  return capabilities.map((capability, index) => ({
    id: `cap_${index}`,
    userId: 'user_1',
    capability,
    createdAt: new Date(),
  }));
}

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
    capabilities: capabilityRows(['CLIENT']),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as UserWithCapabilities;
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
      capabilities: ['CLIENT'],
    });
  });

  // GET /users/me is the page-reload path: the frontend restores a session
  // with refresh() and then reads the user from here, so this response
  // carrying capabilities is what makes them survive a refresh.
  it('returns both capabilities for a user who holds CLIENT and PROVIDER', async () => {
    usersRepository.findById.mockResolvedValue(
      buildUser({ capabilities: capabilityRows(['CLIENT', 'PROVIDER']) }),
    );

    const result = await usersService.getById('user_1');

    expect(result.capabilities).toEqual(['CLIENT', 'PROVIDER']);
  });

  // platformRole is a separate axis from capabilities (Module 01): being an
  // admin grants no marketplace capability, and the response must not
  // invent one. A Super Admin with no capability rows reports none.
  it('reports no capabilities for a SUPER_ADMIN with no capability rows', async () => {
    usersRepository.findById.mockResolvedValue(
      buildUser({ platformRole: 'SUPER_ADMIN', capabilities: [] }),
    );

    const result = await usersService.getById('user_1');

    expect(result.capabilities).toEqual([]);
  });

  // The legacy scalar role must never be used to synthesise a capability —
  // this user's role says PROVIDER but the only real grant is CLIENT.
  it('reads capabilities from the capability rows, never from the legacy role', async () => {
    usersRepository.findById.mockResolvedValue(
      buildUser({ role: 'PROVIDER', capabilities: capabilityRows(['CLIENT']) }),
    );

    const result = await usersService.getById('user_1');

    expect(result.capabilities).toEqual(['CLIENT']);
    expect(result.role).toBe('PROVIDER');
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
