import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CapabilitiesService } from '../services/capabilities.service';
import type { UsersRepository, UserWithCapabilities } from '../repositories/users.repository';

function buildUser(overrides: Partial<UserWithCapabilities> = {}): UserWithCapabilities {
  return {
    id: 'user_1',
    email: 'jane@example.com',
    passwordHash: 'hashed',
    name: 'Jane',
    role: 'CLIENT',
    platformRole: 'USER',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    capabilities: [],
    ...overrides,
  } as UserWithCapabilities;
}

describe('CapabilitiesService.activate', () => {
  let usersRepository: jest.Mocked<UsersRepository>;
  let service: CapabilitiesService;

  beforeEach(() => {
    usersRepository = {
      findById: jest.fn(),
      grantCapability: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    service = new CapabilitiesService(usersRepository);
  });

  it('grants the requested capability for a verified user', async () => {
    usersRepository.findById.mockResolvedValue(buildUser());

    await service.activate('user_1', 'PROVIDER');

    expect(usersRepository.grantCapability).toHaveBeenCalledWith('user_1', 'PROVIDER');
  });

  it('is idempotent: activating an already-held capability succeeds without error', async () => {
    usersRepository.findById.mockResolvedValue(
      buildUser({ capabilities: [{ id: 'c1', userId: 'user_1', capability: 'CLIENT' } as never] }),
    );

    await expect(service.activate('user_1', 'CLIENT')).resolves.toBeUndefined();
    expect(usersRepository.grantCapability).toHaveBeenCalledWith('user_1', 'CLIENT');
  });

  it('rejects an unverified email', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ emailVerifiedAt: null }));

    await expect(service.activate('user_1', 'PROVIDER')).rejects.toThrow(ForbiddenException);
    expect(usersRepository.grantCapability).not.toHaveBeenCalled();
  });

  it('rejects when the user does not exist', async () => {
    usersRepository.findById.mockResolvedValue(null);

    await expect(service.activate('missing', 'CLIENT')).rejects.toThrow(NotFoundException);
  });

  it('rejects a soft-deleted user', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ deletedAt: new Date() }));

    await expect(service.activate('user_1', 'CLIENT')).rejects.toThrow(NotFoundException);
  });
});
