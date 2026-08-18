import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { getOwnProfileOrThrow } from '../../profiles/profile-access.util';
import { paginate } from '../../marketplace/pagination';
import { ConnectionsRepository } from '../repositories/connections.repository';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

/**
 * Reads, plus the one write that moves a connection's own lifecycle:
 * confirmComplete.
 *
 * There is still no create method here, and that is the design rather than
 * an omission: a connection is written inside the acceptance transaction in
 * ProposalsService, because it must never exist without the accepted
 * proposal and filled requirement that produced it. A service method that
 * could create one on its own would be a way to manufacture a hiring
 * relationship that nobody agreed to.
 *
 * ACTIVE -> COMPLETED is the only transition that exists (module5-completion.md)
 * — either the client confirms, or listMine/findById's sweep auto-completes a
 * connection whose event happened long enough ago that a stalled
 * confirmation shouldn't keep blocking Reviews. No close, cancel, or any
 * other status.
 */
@Injectable()
export class ConnectionsService {
  constructor(
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly profilesRepository: ProfilesRepository,
  ) {}

  async listMine(userId: string, pagination: PaginationQueryDto) {
    const profile = await this.getOwnProfile(userId);
    await this.connectionsRepository.sweepAutoComplete();
    const { page, limit } = pagination;

    // One query for both roles. A client's connections and a provider's are
    // the same rows read from opposite sides, so two endpoints would be two
    // names for one list — and the caller's role already tells the frontend
    // which side of each row is "them".
    const [data, total] = await Promise.all([
      this.connectionsRepository.listByProfile(profile.id, (page - 1) * limit, limit),
      this.connectionsRepository.countByProfile(profile.id),
    ]);

    return paginate(data, total, page, limit);
  }

  async findById(userId: string, connectionId: string) {
    const profile = await this.getOwnProfile(userId);
    await this.connectionsRepository.sweepAutoComplete();
    const connection = await this.connectionsRepository.findById(connectionId);

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    const isParty =
      connection.clientProfileId === profile.id || connection.providerProfileId === profile.id;
    if (!isParty) {
      throw new ForbiddenException('You do not have access to this connection');
    }

    // Returned whole. The two ownership ids read for the check above are
    // already on the row as `clientProfile.id` and `providerProfile.id`, so
    // stripping them would hide nothing and cost a rebuild of the object.
    return connection;
  }

  /**
   * The client confirms the connection complete. Only the client — the
   * provider has nothing to gate on here, since nothing downstream depends
   * on a provider-side step (no escrow, no payout; see
   * module5-completion.md). Idempotent, same convention as
   * NotificationsService.markAsRead: confirming an already-completed
   * connection (including one the sweep already closed) just returns it
   * unchanged rather than erroring.
   */
  async confirmComplete(userId: string, connectionId: string) {
    const profile = await this.getOwnProfile(userId);
    const connection = await this.connectionsRepository.findById(connectionId);

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }
    if (connection.clientProfileId !== profile.id) {
      const isProvider = connection.providerProfileId === profile.id;
      throw new ForbiddenException(
        isProvider
          ? 'Only the client can confirm a connection complete'
          : 'You do not have access to this connection',
      );
    }
    if (connection.status === 'COMPLETED') {
      return connection;
    }

    // Not a >= against "now the moment of the request" — the event's own
    // day must have fully passed, matching the sweep's own definition of
    // "the event happened".
    if (!connection.job.eventDate || connection.job.eventDate.getTime() > Date.now()) {
      throw new ConflictException('Cannot confirm complete before the event date');
    }

    return this.connectionsRepository.markCompleted(connectionId);
  }

  private async getOwnProfile(userId: string) {
    return getOwnProfileOrThrow(this.profilesRepository, userId);
  }
}
