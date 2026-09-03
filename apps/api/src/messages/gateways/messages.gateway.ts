import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { UsersRepository } from '../../identity/repositories/users.repository';
import { ConnectionsService } from '../../proposals/services/connections.service';
import { parseCorsOrigins } from '../../config/cors-origins';
import type { JwtPayload } from '../../identity/strategies/jwt.strategy';
import type { Message } from '@marche/db';

function connectionRoom(connectionId: string): string {
  return `connection:${connectionId}`;
}

// Push-only: sending/listing/marking-read still go through the existing,
// tested REST endpoints (ConnectionMessagesController) — this gateway
// doesn't re-implement any of that. It exists solely so MessagesService can
// tell already-connected clients "something changed" instead of them
// polling every 4 seconds (FEATURE_GAP_ANALYSIS.md #2).
//
// Authorization is deliberately not re-derived here: join:connection reuses
// ConnectionsService.findById, the exact same "is this user a party to this
// connection" check every REST message route already relies on.
@WebSocketGateway({
  cors: { origin: parseCorsOrigins(process.env.CORS_ORIGINS), credentials: true },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(MessagesGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersRepository: UsersRepository,
    private readonly connectionsService: ConnectionsService,
  ) {}

  // Browsers can't set a custom Authorization header on the WS upgrade
  // request, so the access token travels in Socket.IO's `auth` payload
  // instead (io(url, { auth: { token } })) — verified here the same way
  // JwtStrategy.validate does for every HTTP request: signature+expiry,
  // then a fresh DB read for status, never trusting the payload alone.
  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user = await this.usersRepository.findById(payload.sub);
      if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
        client.disconnect(true);
        return;
      }
      client.data.userId = user.id;
      // The transport-level handshake (and the client's 'connect' event)
      // completes before this async auth check does — Nest doesn't block a
      // socket from receiving other events while handleConnection's promise
      // is still pending. Without this signal, a client that emits
      // join:connection immediately on 'connect' can race ahead of
      // client.data.userId being set and get spuriously rejected.
      client.emit('authenticated');
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Socket.IO already drops a disconnected client from every room it had
    // joined — nothing to clean up here.
  }

  // Join is per-thread, not automatic on connect: a client only needs
  // pushes for the conversation currently open, and joining every
  // connection a user is party to would mean re-running the authorization
  // check for threads that were never going to be viewed this session.
  @SubscribeMessage('join:connection')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { connectionId?: string },
  ): Promise<{ ok: boolean; message?: string }> {
    const connectionId = body?.connectionId;
    const userId = client.data.userId as string | undefined;
    if (!userId || !connectionId) {
      return { ok: false, message: 'Missing connectionId' };
    }

    try {
      await this.connectionsService.findById(userId, connectionId);
    } catch (error) {
      this.logger.warn(`Rejected join:connection for ${connectionId}: ${(error as Error).message}`);
      return { ok: false, message: 'You do not have access to this connection' };
    }

    await client.join(connectionRoom(connectionId));
    return { ok: true };
  }

  @SubscribeMessage('leave:connection')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() body: { connectionId?: string }) {
    if (body?.connectionId) {
      void client.leave(connectionRoom(body.connectionId));
    }
  }

  // ---------- called from MessagesService after a write commits ----------

  emitNewMessage(connectionId: string, message: Message): void {
    this.server.to(connectionRoom(connectionId)).emit('message:new', message);
  }

  emitMessagesRead(connectionId: string, readerUserId: string): void {
    this.server.to(connectionRoom(connectionId)).emit('message:read', { readerUserId });
  }
}
