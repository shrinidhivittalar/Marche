import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../marketplace/pagination';
import type { AuditLogQueryDto } from './dto/audit-log-query.dto';
import type { Prisma, PlatformRole } from '@marche/db';

export interface AuditEventInput {
  /** Namespaced, e.g. "auth.login.success" — see each module's own event-name constants. */
  eventType: string;
  userId?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  /** Event-specific extra context. Keep it small — this is an audit trail, not a data dump. */
  metadata?: Record<string, unknown>;
}

// Deliberately generic and module-agnostic — every future module (Jobs,
// Contracts, Payments, ...) records into the same audit_logs table through
// this one service, instead of each module growing its own logging table.
// Never throws: a failure to write an audit row must never break the
// business operation it's describing.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEventInput): Promise<void> {
    try {
      await this.prisma.client.auditLog.create({
        data: {
          eventType: event.eventType,
          userId: event.userId,
          email: event.email,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          metadata: event.metadata as never,
        },
      });
    } catch {
      // Swallow — audit logging is observability, not business logic. A DB
      // hiccup here must never fail a login/register/etc. request.
    }
  }

  // Admin-only read side. There is no controller route for anyone else —
  // this is a security trail, not a per-user activity feed.
  //
  // Checks platformRole, not the legacy User.role — see the identical fix
  // and reasoning on marketplace-access.util.ts's assertAdminRole.
  async list(platformRole: PlatformRole, query: AuditLogQueryDto) {
    if (platformRole !== 'ADMIN' && platformRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('This is only available to admins');
    }

    const { page, limit, search } = query;
    const where: Prisma.AuditLogWhereInput = search
      ? {
          OR: [
            { eventType: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        // Newest first, id as a tiebreaker — same rule as every other list
        // in this codebase.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }
}
