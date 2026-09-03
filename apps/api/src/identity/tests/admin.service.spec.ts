import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminService } from '../services/admin.service';
import type { UsersRepository, UserWithCapabilities } from '../repositories/users.repository';
import type { AuditService } from '../../audit/audit.service';

function buildUser(overrides: Partial<UserWithCapabilities> = {}): UserWithCapabilities {
  return {
    id: 'target_1',
    email: 'target@example.com',
    passwordHash: 'hashed',
    name: 'Target',
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

describe('AdminService.changePlatformRole', () => {
  let usersRepository: jest.Mocked<UsersRepository>;
  let auditService: jest.Mocked<AuditService>;
  let service: AdminService;

  beforeEach(() => {
    usersRepository = {
      findById: jest.fn(),
      countByPlatformRole: jest.fn(),
      updatePlatformRoleIfCurrent: jest.fn(),
      updateStatusIfCurrent: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    auditService = { record: jest.fn() } as unknown as jest.Mocked<AuditService>;
    service = new AdminService(usersRepository, auditService);
  });

  it('rejects a self-change, regardless of direction', async () => {
    await expect(service.changePlatformRole('actor_1', 'actor_1', 'ADMIN')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(usersRepository.findById).not.toHaveBeenCalled();
  });

  it('404s when the target does not exist', async () => {
    usersRepository.findById.mockResolvedValue(null);

    await expect(service.changePlatformRole('actor_1', 'missing', 'ADMIN')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s for a soft-deleted target', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ deletedAt: new Date() }));

    await expect(service.changePlatformRole('actor_1', 'target_1', 'ADMIN')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('is a true no-op when the requested role equals the current one — no write, no audit', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ platformRole: 'ADMIN' }));

    const result = await service.changePlatformRole('actor_1', 'target_1', 'ADMIN');

    expect(result).toEqual({ changed: false, platformRole: 'ADMIN' });
    expect(usersRepository.updatePlatformRoleIfCurrent).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('promotes USER to ADMIN and audits the transition', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ platformRole: 'USER' }));
    usersRepository.updatePlatformRoleIfCurrent.mockResolvedValue(1);

    const result = await service.changePlatformRole('actor_1', 'target_1', 'ADMIN');

    expect(result).toEqual({ changed: true, platformRole: 'ADMIN' });
    expect(usersRepository.updatePlatformRoleIfCurrent).toHaveBeenCalledWith(
      'target_1',
      'USER',
      'ADMIN',
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'admin.platform_role.changed',
        userId: 'actor_1',
        metadata: { targetUserId: 'target_1', previousRole: 'USER', newRole: 'ADMIN' },
      }),
    );
  });

  it('demotes ADMIN to USER without touching the Super Admin count check', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ platformRole: 'ADMIN' }));
    usersRepository.updatePlatformRoleIfCurrent.mockResolvedValue(1);

    await service.changePlatformRole('actor_1', 'target_1', 'USER');

    expect(usersRepository.countByPlatformRole).not.toHaveBeenCalled();
  });

  it('demotes SUPER_ADMIN to ADMIN when other Super Admins remain', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ platformRole: 'SUPER_ADMIN' }));
    usersRepository.countByPlatformRole.mockResolvedValue(2);
    usersRepository.updatePlatformRoleIfCurrent.mockResolvedValue(1);

    const result = await service.changePlatformRole('actor_1', 'target_1', 'ADMIN');

    expect(result.changed).toBe(true);
  });

  it('rejects demoting the last Super Admin', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ platformRole: 'SUPER_ADMIN' }));
    usersRepository.countByPlatformRole.mockResolvedValue(1);

    await expect(service.changePlatformRole('actor_1', 'target_1', 'ADMIN')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(usersRepository.updatePlatformRoleIfCurrent).not.toHaveBeenCalled();
  });

  it('rejects demoting the last Super Admin straight to USER too', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ platformRole: 'SUPER_ADMIN' }));
    usersRepository.countByPlatformRole.mockResolvedValue(1);

    await expect(service.changePlatformRole('actor_1', 'target_1', 'USER')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('allows promoting a Super Admin to Super Admin from a different starting role without the last-admin check (unreachable in practice, but the guard only fires on demotion away from SUPER_ADMIN)', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ platformRole: 'ADMIN' }));
    usersRepository.updatePlatformRoleIfCurrent.mockResolvedValue(1);

    await service.changePlatformRole('actor_1', 'target_1', 'SUPER_ADMIN');

    expect(usersRepository.countByPlatformRole).not.toHaveBeenCalled();
  });

  it('surfaces a concurrent-change conflict when the conditional update affects zero rows', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ platformRole: 'USER' }));
    usersRepository.updatePlatformRoleIfCurrent.mockResolvedValue(0);

    await expect(service.changePlatformRole('actor_1', 'target_1', 'ADMIN')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(auditService.record).not.toHaveBeenCalled();
  });
});

describe('AdminService.setUserStatus', () => {
  let usersRepository: jest.Mocked<UsersRepository>;
  let auditService: jest.Mocked<AuditService>;
  let service: AdminService;

  beforeEach(() => {
    usersRepository = {
      findById: jest.fn(),
      countByPlatformRole: jest.fn(),
      updateStatusIfCurrent: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    auditService = { record: jest.fn() } as unknown as jest.Mocked<AuditService>;
    service = new AdminService(usersRepository, auditService);
  });

  it('rejects a self-change, regardless of direction', async () => {
    await expect(service.setUserStatus('actor_1', 'actor_1', 'SUSPENDED')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(usersRepository.findById).not.toHaveBeenCalled();
  });

  it('404s when the target does not exist', async () => {
    usersRepository.findById.mockResolvedValue(null);

    await expect(service.setUserStatus('actor_1', 'missing', 'SUSPENDED')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s for a soft-deleted target', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ deletedAt: new Date() }));

    await expect(service.setUserStatus('actor_1', 'target_1', 'SUSPENDED')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('is a true no-op when the requested status equals the current one — no write, no audit', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ status: 'SUSPENDED' }));

    const result = await service.setUserStatus('actor_1', 'target_1', 'SUSPENDED');

    expect(result).toEqual({ changed: false, status: 'SUSPENDED' });
    expect(usersRepository.updateStatusIfCurrent).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it('suspends an active user and audits the transition', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ status: 'ACTIVE' }));
    usersRepository.updateStatusIfCurrent.mockResolvedValue(1);

    const result = await service.setUserStatus('actor_1', 'target_1', 'SUSPENDED');

    expect(result).toEqual({ changed: true, status: 'SUSPENDED' });
    expect(usersRepository.updateStatusIfCurrent).toHaveBeenCalledWith(
      'target_1',
      'ACTIVE',
      'SUSPENDED',
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'admin.user_status.changed',
        userId: 'actor_1',
        metadata: { targetUserId: 'target_1', previousStatus: 'ACTIVE', newStatus: 'SUSPENDED' },
      }),
    );
  });

  it('restores a suspended user back to active', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ status: 'SUSPENDED' }));
    usersRepository.updateStatusIfCurrent.mockResolvedValue(1);

    const result = await service.setUserStatus('actor_1', 'target_1', 'ACTIVE');

    expect(result).toEqual({ changed: true, status: 'ACTIVE' });
    expect(usersRepository.countByPlatformRole).not.toHaveBeenCalled();
  });

  it('rejects suspending the last Super Admin', async () => {
    usersRepository.findById.mockResolvedValue(
      buildUser({ platformRole: 'SUPER_ADMIN', status: 'ACTIVE' }),
    );
    usersRepository.countByPlatformRole.mockResolvedValue(1);

    await expect(service.setUserStatus('actor_1', 'target_1', 'SUSPENDED')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(usersRepository.updateStatusIfCurrent).not.toHaveBeenCalled();
  });

  it('suspends a Super Admin when other Super Admins remain', async () => {
    usersRepository.findById.mockResolvedValue(
      buildUser({ platformRole: 'SUPER_ADMIN', status: 'ACTIVE' }),
    );
    usersRepository.countByPlatformRole.mockResolvedValue(2);
    usersRepository.updateStatusIfCurrent.mockResolvedValue(1);

    const result = await service.setUserStatus('actor_1', 'target_1', 'SUSPENDED');

    expect(result.changed).toBe(true);
  });

  it('surfaces a concurrent-change conflict when the conditional update affects zero rows', async () => {
    usersRepository.findById.mockResolvedValue(buildUser({ status: 'ACTIVE' }));
    usersRepository.updateStatusIfCurrent.mockResolvedValue(0);

    await expect(service.setUserStatus('actor_1', 'target_1', 'SUSPENDED')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(auditService.record).not.toHaveBeenCalled();
  });
});

describe('AdminService.listUsers', () => {
  let usersRepository: jest.Mocked<UsersRepository>;
  let auditService: jest.Mocked<AuditService>;
  let service: AdminService;

  beforeEach(() => {
    usersRepository = {
      listAll: jest.fn(),
      countAll: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    auditService = { record: jest.fn() } as unknown as jest.Mocked<AuditService>;
    service = new AdminService(usersRepository, auditService);
  });

  it('passes page/limit/filters through and paginates the result', async () => {
    const rows = [{ id: 'user_1' }, { id: 'user_2' }];
    usersRepository.listAll.mockResolvedValue(rows as never);
    usersRepository.countAll.mockResolvedValue(2);

    const result = await service.listUsers({
      page: 1,
      limit: 20,
      status: 'SUSPENDED',
      platformRole: undefined,
      search: 'jane',
    });

    expect(usersRepository.listAll).toHaveBeenCalledWith(
      { status: 'SUSPENDED', platformRole: undefined, search: 'jane' },
      0,
      20,
    );
    expect(usersRepository.countAll).toHaveBeenCalledWith({
      status: 'SUSPENDED',
      platformRole: undefined,
      search: 'jane',
    });
    expect(result.data).toBe(rows);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
  });

  it('computes the correct skip for page 2', async () => {
    usersRepository.listAll.mockResolvedValue([]);
    usersRepository.countAll.mockResolvedValue(0);

    await service.listUsers({ page: 2, limit: 10 });

    expect(usersRepository.listAll).toHaveBeenCalledWith(
      { status: undefined, platformRole: undefined, search: undefined },
      10,
      10,
    );
  });
});
