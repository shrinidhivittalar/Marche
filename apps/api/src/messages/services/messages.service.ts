import { Injectable } from '@nestjs/common';
import { MessagesRepository } from '../repositories/messages.repository';
import { ConnectionsService } from '../../proposals/services/connections.service';
import { ConnectionsRepository } from '../../proposals/repositories/connections.repository';
import { ProfilesRepository } from '../../profiles/repositories/profiles.repository';
import { getOwnProfileOrThrow } from '../../profiles/profile-access.util';
import { paginate } from '../../marketplace/pagination';
import type { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';
import type { Message } from '@marche/db';

@Injectable()
export class MessagesService {
  constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly connectionsService: ConnectionsService,
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly profilesRepository: ProfilesRepository,
  ) {}

  // ---------- one connection's thread ----------

  // ConnectionsService.findById is the authorization: it throws NotFound for
  // a connection that doesn't exist and Forbidden for one the caller isn't a
  // party to. Nothing here re-derives that check — a message can only ever
  // be read or sent by the two people the Connection already names.
  async list(userId: string, connectionId: string, pagination: PaginationQueryDto) {
    await this.connectionsService.findById(userId, connectionId);
    const { page, limit } = pagination;
    const [data, total] = await Promise.all([
      this.messagesRepository.listByConnection(connectionId, (page - 1) * limit, limit),
      this.messagesRepository.countByConnection(connectionId),
    ]);
    return paginate(data, total, page, limit);
  }

  async send(userId: string, connectionId: string, body: string): Promise<Message> {
    await this.connectionsService.findById(userId, connectionId);
    return this.messagesRepository.create(connectionId, userId, body);
  }

  async markRead(userId: string, connectionId: string): Promise<void> {
    await this.connectionsService.findById(userId, connectionId);
    await this.messagesRepository.markConnectionRead(connectionId, userId);
  }

  // ---------- across every connection (conversation list) ----------

  async previews(userId: string) {
    const profile = await getOwnProfileOrThrow(this.profilesRepository, userId);
    const connectionIds = await this.connectionsRepository.listIdsByProfile(profile.id);
    const [latest, unread] = await Promise.all([
      this.messagesRepository.listLatestPerConnection(connectionIds),
      this.messagesRepository.countUnreadPerConnection(connectionIds, userId),
    ]);
    const latestByConnection = new Map(latest.map((message) => [message.connectionId, message]));

    return connectionIds.map((connectionId) => ({
      connectionId,
      lastMessage: latestByConnection.get(connectionId) ?? null,
      unreadCount: unread.get(connectionId) ?? 0,
    }));
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const profile = await getOwnProfileOrThrow(this.profilesRepository, userId);
    const connectionIds = await this.connectionsRepository.listIdsByProfile(profile.id);
    const count = await this.messagesRepository.countUnreadForConnections(connectionIds, userId);
    return { count };
  }
}
