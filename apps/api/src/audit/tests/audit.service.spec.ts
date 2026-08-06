import { AuditService } from '../audit.service';
import type { PrismaService } from '../../prisma/prisma.service';

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
});
