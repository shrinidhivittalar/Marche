import { ForbiddenException } from '@nestjs/common';
import { AuditService } from '../audit.service';
import type { PrismaService } from '../../prisma/prisma.service';

function buildForList() {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = { client: { auditLog: { findMany, count } } } as unknown as PrismaService;
  return { auditService: new AuditService(prisma), findMany, count };
}

describe('AuditService', () => {
  it('writes an audit_logs row with the given fields', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { client: { auditLog: { create } } } as unknown as PrismaService;
    const auditService = new AuditService(prisma);

    await auditService.record({
      eventType: 'auth.login.success',
      userId: 'user_1',
      email: 'jane@example.com',
      ipAddress: '127.0.0.1',
      metadata: { foo: 'bar' },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        eventType: 'auth.login.success',
        userId: 'user_1',
        email: 'jane@example.com',
        ipAddress: '127.0.0.1',
        userAgent: undefined,
        metadata: { foo: 'bar' },
      },
    });
  });

  it('never throws, even when the write fails — audit logging must not break the caller', async () => {
    const create = jest.fn().mockRejectedValue(new Error('DB is down'));
    const prisma = { client: { auditLog: { create } } } as unknown as PrismaService;
    const auditService = new AuditService(prisma);

    await expect(auditService.record({ eventType: 'auth.login.success' })).resolves.toBeUndefined();
  });

  describe('list', () => {
    it('refuses anyone who is not an admin', async () => {
      const { auditService } = buildForList();

      await expect(auditService.list('CLIENT', { page: 1, limit: 20 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    // Module 1 closeout fix: this used to check the caller's legacy
    // User.role, which never becomes 'ADMIN' for anyone promoted through
    // Slice 6's PATCH /admin/users/:id/platform-role — only platformRole
    // does. SUPER_ADMIN must pass too, as a strict superset of ADMIN.
    it('allows a SUPER_ADMIN', async () => {
      const { auditService, findMany } = buildForList();

      await auditService.list('SUPER_ADMIN', { page: 1, limit: 20 });

      expect(findMany).toHaveBeenCalled();
    });

    it('matches search against eventType or email, case-insensitively', async () => {
      const { auditService, findMany, count } = buildForList();

      await auditService.list('ADMIN', { page: 1, limit: 20, search: 'login' });

      const expectedWhere = {
        OR: [
          { eventType: { contains: 'login', mode: 'insensitive' } },
          { email: { contains: 'login', mode: 'insensitive' } },
        ],
      };
      expect(findMany.mock.calls[0][0].where).toEqual(expectedWhere);
      expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    });

    it('orders newest first with a total order, and paginates', async () => {
      const { auditService, findMany } = buildForList();

      await auditService.list('ADMIN', { page: 2, limit: 10 });

      expect(findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(findMany.mock.calls[0][0].skip).toBe(10);
      expect(findMany.mock.calls[0][0].take).toBe(10);
      expect(findMany.mock.calls[0][0].where).toEqual({});
    });
  });
});
