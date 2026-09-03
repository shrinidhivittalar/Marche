import { ForbiddenException } from '@nestjs/common';
import { MessagesGateway } from '../gateways/messages.gateway';

function buildSocket(overrides: Record<string, unknown> = {}) {
  return {
    handshake: { auth: { token: 'valid-token' } },
    data: {} as Record<string, unknown>,
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    ...overrides,
  };
}

function build() {
  const jwtService = { verifyAsync: jest.fn() };
  const usersRepository = { findById: jest.fn() };
  const connectionsService = { findById: jest.fn() };

  const gateway = new MessagesGateway(
    jwtService as never,
    usersRepository as never,
    connectionsService as never,
  );

  // @WebSocketServer() is injected by Nest at runtime; stub it directly
  // since these are plain unit tests, not a bootstrapped gateway.
  const server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
  (gateway as unknown as { server: unknown }).server = server;

  return { gateway, jwtService, usersRepository, connectionsService, server };
}

describe('MessagesGateway.handleConnection', () => {
  it('disconnects a client with no token at all', async () => {
    const { gateway } = build();
    const socket = buildSocket({ handshake: { auth: {} } });

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a client whose token fails verification', async () => {
    const { gateway, jwtService } = build();
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    const socket = buildSocket();

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a client whose user is not ACTIVE — same gate as JwtStrategy.validate', async () => {
    const { gateway, jwtService, usersRepository } = build();
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user_1', role: 'CLIENT' });
    usersRepository.findById.mockResolvedValue({
      id: 'user_1',
      status: 'SUSPENDED',
      deletedAt: null,
    });
    const socket = buildSocket();

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('attaches userId to the socket and emits authenticated for a valid, active user', async () => {
    const { gateway, jwtService, usersRepository } = build();
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user_1', role: 'CLIENT' });
    usersRepository.findById.mockResolvedValue({ id: 'user_1', status: 'ACTIVE', deletedAt: null });
    const socket = buildSocket();

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.data.userId).toBe('user_1');
    // A client that races ahead and emits join:connection right on
    // transport-level 'connect' — before this async auth check resolves —
    // must wait for this signal rather than assume client.data.userId is
    // already set (regression coverage for the race found while smoke
    // testing against a real socket connection).
    expect(socket.emit).toHaveBeenCalledWith('authenticated');
  });

  it('never emits authenticated for a rejected connection', async () => {
    const { gateway, jwtService, usersRepository } = build();
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user_1', role: 'CLIENT' });
    usersRepository.findById.mockResolvedValue({
      id: 'user_1',
      status: 'SUSPENDED',
      deletedAt: null,
    });
    const socket = buildSocket();

    await gateway.handleConnection(socket as never);

    expect(socket.emit).not.toHaveBeenCalledWith('authenticated');
  });
});

describe('MessagesGateway.handleJoin', () => {
  it('reuses ConnectionsService.findById as the sole authorization check', async () => {
    const { gateway, connectionsService } = build();
    connectionsService.findById.mockResolvedValue({ id: 'connection_1' });
    const socket = buildSocket({ data: { userId: 'user_1' } });

    const result = await gateway.handleJoin(socket as never, { connectionId: 'connection_1' });

    expect(connectionsService.findById).toHaveBeenCalledWith('user_1', 'connection_1');
    expect(socket.join).toHaveBeenCalledWith('connection:connection_1');
    expect(result).toEqual({ ok: true });
  });

  it('rejects and does not join when the caller is not a party to the connection', async () => {
    const { gateway, connectionsService } = build();
    connectionsService.findById.mockRejectedValue(new ForbiddenException());
    const socket = buildSocket({ data: { userId: 'user_2' } });

    const result = await gateway.handleJoin(socket as never, { connectionId: 'connection_1' });

    expect(socket.join).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('rejects a join with no authenticated userId on the socket', async () => {
    const { gateway, connectionsService } = build();
    const socket = buildSocket({ data: {} });

    const result = await gateway.handleJoin(socket as never, { connectionId: 'connection_1' });

    expect(connectionsService.findById).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});

describe('MessagesGateway push methods', () => {
  it('emitNewMessage pushes into the room scoped to that connection only', () => {
    const { gateway, server } = build();

    gateway.emitNewMessage('connection_1', { id: 'message_1', body: 'hi' } as never);

    expect(server.to).toHaveBeenCalledWith('connection:connection_1');
    expect(server.emit).toHaveBeenCalledWith('message:new', { id: 'message_1', body: 'hi' });
  });

  it('emitMessagesRead pushes the reader id into the room', () => {
    const { gateway, server } = build();

    gateway.emitMessagesRead('connection_1', 'user_1');

    expect(server.to).toHaveBeenCalledWith('connection:connection_1');
    expect(server.emit).toHaveBeenCalledWith('message:read', { readerUserId: 'user_1' });
  });
});
