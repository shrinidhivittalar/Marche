import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository';
import { AuditService } from '../../audit/audit.service';
import { ADMIN_EVENTS } from '../audit-events';
import type { PlatformRole, UserStatus } from '@marche/db';

export interface PlatformRoleChangeResult {
  changed: boolean;
  platformRole: PlatformRole;
}

export interface UserStatusChangeResult {
  changed: boolean;
  status: UserStatus;
}

// Module 01 Slice 6 — platform-role elevation/demotion
// (module1-implementation-contract.md §5). The only mutation path for
// platformRole after the one-time bootstrap script (see
// packages/db/scripts/bootstrap-super-admin.ts) — never self-service,
// never inferred from a capability or a marketplace action.
@Injectable()
export class AdminService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly auditService: AuditService,
  ) {}

  async changePlatformRole(
    actorId: string,
    targetUserId: string,
    requestedRole: PlatformRole,
  ): Promise<PlatformRoleChangeResult> {
    // No self-change, regardless of direction — a Super Admin demoting or
    // re-promoting themselves is exactly the kind of action that must go
    // through a second, independent Super Admin.
    if (actorId === targetUserId) {
      throw new ForbiddenException('You cannot change your own platform role');
    }

    const target = await this.usersRepository.findById(targetUserId);
    if (!target || target.deletedAt) {
      throw new NotFoundException('User not found');
    }

    // No-op requests are a true no-op: no DB write, no audit row. A
    // duplicate audit entry for a genuine double-submit is noise, not
    // signal — the audit trail should record actual transitions only.
    if (target.platformRole === requestedRole) {
      return { changed: false, platformRole: target.platformRole };
    }

    // The one hard invariant: never let the last Super Admin be demoted.
    // Checked before the write, and the write itself stays conditioned on
    // the role read here not having changed underneath it (see
    // UsersRepository.updatePlatformRoleIfCurrent) — this narrows, but does
    // not perfectly close, the race between two Super Admins independently
    // demoting two different Super Admins at the exact moment exactly two
    // remain; that residual window is accepted here as disproportionate to
    // close for a rare, human-triggered, Super-Admin-gated operation (see
    // the Slice 6 report for the explicit tradeoff).
    if (target.platformRole === 'SUPER_ADMIN' && requestedRole !== 'SUPER_ADMIN') {
      const superAdminCount = await this.usersRepository.countByPlatformRole('SUPER_ADMIN');
      if (superAdminCount <= 1) {
        throw new ConflictException('Cannot remove the last Super Admin');
      }
    }

    const previousRole = target.platformRole;
    const updatedCount = await this.usersRepository.updatePlatformRoleIfCurrent(
      targetUserId,
      previousRole,
      requestedRole,
    );
    if (updatedCount === 0) {
      throw new ConflictException(
        'This user’s platform role changed concurrently — retry with the current value',
      );
    }

    await this.auditService.record({
      eventType: ADMIN_EVENTS.PLATFORM_ROLE_CHANGED,
      userId: actorId,
      metadata: { targetUserId, previousRole, newRole: requestedRole },
    });

    return { changed: true, platformRole: requestedRole };
  }

  // Minimum-viable moderation (FEATURE_GAP_ANALYSIS.md #1 — no lever to act
  // on a bad actor). Deliberately reuses the existing UserStatus.SUSPENDED
  // value rather than adding a new field: JwtStrategy.validate already
  // rejects any non-ACTIVE user on every request, so this endpoint is the
  // only piece that was actually missing — enforcement was already live.
  async setUserStatus(
    actorId: string,
    targetUserId: string,
    requestedStatus: UserStatus,
  ): Promise<UserStatusChangeResult> {
    // Same reasoning as changePlatformRole: an admin cannot suspend or
    // restore their own account — that must go through a second admin.
    if (actorId === targetUserId) {
      throw new ForbiddenException('You cannot change your own account status');
    }

    const target = await this.usersRepository.findById(targetUserId);
    if (!target || target.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (target.status === requestedStatus) {
      return { changed: false, status: target.status };
    }

    // Mirrors the last-Super-Admin protection on platformRole: suspending
    // the only remaining Super Admin would leave nobody able to restore
    // them.
    if (
      requestedStatus === 'SUSPENDED' &&
      target.platformRole === 'SUPER_ADMIN' &&
      target.status === 'ACTIVE'
    ) {
      const superAdminCount = await this.usersRepository.countByPlatformRole('SUPER_ADMIN');
      if (superAdminCount <= 1) {
        throw new ConflictException('Cannot suspend the last Super Admin');
      }
    }

    const previousStatus = target.status;
    const updatedCount = await this.usersRepository.updateStatusIfCurrent(
      targetUserId,
      previousStatus,
      requestedStatus,
    );
    if (updatedCount === 0) {
      throw new ConflictException(
        'This user’s status changed concurrently — retry with the current value',
      );
    }

    await this.auditService.record({
      eventType: ADMIN_EVENTS.USER_STATUS_CHANGED,
      userId: actorId,
      metadata: { targetUserId, previousStatus, newStatus: requestedStatus },
    });

    return { changed: true, status: requestedStatus };
  }
}
