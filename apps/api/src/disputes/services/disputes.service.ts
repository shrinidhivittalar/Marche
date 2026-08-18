import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DisputesRepository } from '../repositories/disputes.repository';
import { ConnectionsService } from '../../proposals/services/connections.service';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { getOwnProfileOrThrow } from '../../profiles/profile-access.util';
import { assertAdminRole } from '../../marketplace/marketplace-access.util';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { paginate } from '../../marketplace/pagination';
import type { DisputeListQueryDto } from '../dto/dispute-list-query.dto';
import type { Dispute } from '@marche/db';

@Injectable()
export class DisputesService {
  constructor(
    private readonly disputesRepository: DisputesRepository,
    private readonly connectionsService: ConnectionsService,
    private readonly profilesRepository: ProfilesRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Either party on a connection may raise a dispute, at any point — not
   * gated on Connection.status, see the schema comment on Dispute. Only one
   * non-resolved dispute per connection at a time.
   */
  async raise(
    userId: string,
    connectionId: string,
    reason: string,
    evidence: string,
  ): Promise<Dispute> {
    const myProfile = await getOwnProfileOrThrow(this.profilesRepository, userId);
    // The party check: findById 404s/403s before anything else runs.
    const connection = await this.connectionsService.findById(userId, connectionId);

    const existing = await this.disputesRepository.findActiveForConnection(connectionId);
    if (existing) {
      throw new ConflictException('This connection already has an active dispute');
    }

    const otherProfileId =
      connection.clientProfileId === myProfile.id
        ? connection.providerProfileId
        : connection.clientProfileId;
    const otherProfile = await this.profilesRepository.findById(otherProfileId);
    if (!otherProfile) {
      throw new NotFoundException('The other party on this connection could not be found');
    }

    const dispute = await this.disputesRepository.create(
      connectionId,
      userId,
      otherProfile.userId,
      reason,
      evidence,
    );

    await this.notificationsService.disputeRaised(otherProfile.userId, {
      connectionId,
      disputeId: dispute.id,
    });

    return dispute;
  }

  /** Either party to the connection, or an admin. */
  async listForConnection(userId: string, role: string, connectionId: string): Promise<Dispute[]> {
    if (role !== 'ADMIN') {
      await this.connectionsService.findById(userId, connectionId); // party check
    }
    return this.disputesRepository.listForConnection(connectionId);
  }

  /** Admin-only queue across every connection, oldest first. */
  async listAll(role: string, query: DisputeListQueryDto) {
    assertAdminRole(role);
    const { page, limit, status } = query;

    const [data, total] = await Promise.all([
      this.disputesRepository.listAll(status, (page - 1) * limit, limit),
      this.disputesRepository.countAll(status),
    ]);

    return paginate(data, total, page, limit);
  }

  /** Admin-only. Idempotent: resolving an already-resolved dispute just returns it unchanged. */
  async resolve(
    role: string,
    disputeId: string,
    resolvedByUserId: string,
    resolution: string,
  ): Promise<Dispute> {
    assertAdminRole(role);
    const dispute = await this.disputesRepository.findById(disputeId);
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }
    if (dispute.status === 'RESOLVED') {
      return dispute;
    }
    return this.disputesRepository.resolve(disputeId, resolvedByUserId, resolution);
  }
}
