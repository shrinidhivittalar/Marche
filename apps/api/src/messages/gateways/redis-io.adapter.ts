import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

// Fans socket.io events out across every API instance via the same
// REDIS_URL the throttler already requires in production — no new
// infrastructure, just a second consumer of it. Without this, a message
// sent by a user connected to instance A never reaches a recipient
// connected to instance B behind Render's load balancer.
//
// Single-instance dev/test is unaffected: connectToRedis is only called
// when REDIS_URL is set (see main.ts), so createIOServer falls back to
// socket.io's default in-memory adapter otherwise.
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  connectToRedis(redisUrl: string): void {
    const pubClient = new Redis(redisUrl);
    const subClient = pubClient.duplicate();

    // Same lesson as redis-throttler-storage.ts's own fix: ioredis emits
    // 'error' on every failed connection attempt, and an unhandled 'error'
    // event crashes the process. A dropped pub/sub connection here should
    // degrade to same-instance-only delivery, not take down the API.
    pubClient.on('error', (err) => this.logger.error(`Redis pub client error: ${err.message}`));
    subClient.on('error', (err) => this.logger.error(`Redis sub client error: ${err.message}`));

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
