import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { getOwnProfileOrThrow } from '../../profiles/profile-access.util';
import { paginate } from '../../marketplace/pagination';
import { ConnectionsRepository } from '../repositories/connections.repository';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

/**
 * Reads only.
 *
 * There is no create method here, and that is the design rather than an
 * omission: a connection is written inside the acceptance transaction in
 * ProposalsService, because it must never exist without the accepted
 * proposal and filled requirement that produced it. A service method that
 * could create one on its own would be a way to manufacture a hiring
 * relationship that nobody agreed to.
 *
 * No close, cancel or status change either — Phase 1 has one state, and the
 * row existing is what it means.
 */
@Injectable()
export class ConnectionsService {
  constructor(
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly profilesRepository: ProfilesRepository,
  ) {}

  async listMine(userId: string, pagination: PaginationQueryDto) {
    const profile = await this.getOwnProfile(userId);
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

  private async getOwnProfile(userId: string) {
    return getOwnProfileOrThrow(this.profilesRepository, userId);
  }
}
