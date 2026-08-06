import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
}
