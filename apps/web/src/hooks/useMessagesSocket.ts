import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from '../lib/api-fetch';

/**
 * One persistent connection for the token's lifetime — not re-created per
 * conversation. Joining/leaving a specific connection's room (and listening
 * for its events) is the caller's job, since which room to be in changes far
 * more often than the socket itself needs to.
 *
 * Auth travels in Socket.IO's `auth` payload, not a header — the same
 * access token every REST call already sends as `Authorization: Bearer`,
 * but browsers can't set custom headers on a WS upgrade request. Verified
 * server-side in MessagesGateway.handleConnection the same way JwtAuthGuard
 * verifies every HTTP request.
 *
 * Returns null until the server confirms auth (its 'authenticated' event),
 * not just on transport connect — MessagesGateway's handleConnection does an
 * async DB lookup after the transport handshake completes, so a caller that
 * joins a room the instant `connect` fires can race ahead of the server
 * actually knowing who this socket belongs to. Resets to null on disconnect
 * too, so a reconnect (network drop, token refresh) is treated the same way
 * as the first connection — nothing joins a room again until re-authenticated.
 */
export function useMessagesSocket(token: string | null): Socket | null {
  const socket = useMemo(() => {
    if (!token) return null;
    return io(API_URL, { auth: { token }, withCredentials: true });
  }, [token]);

  const [authenticatedSocket, setAuthenticatedSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleAuthenticated = () => setAuthenticatedSocket(socket);
    const handleDisconnect = () =>
      setAuthenticatedSocket((current) => (current === socket ? null : current));

    socket.on('authenticated', handleAuthenticated);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('authenticated', handleAuthenticated);
      socket.off('disconnect', handleDisconnect);
      socket.disconnect();
    };
  }, [socket]);

  return socket === authenticatedSocket ? authenticatedSocket : null;
}
