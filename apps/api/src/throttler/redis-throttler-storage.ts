import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

// Not exported from the package root (only ThrottlerStorage is) — shape
// matches ThrottlerStorage['increment']'s return type.
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

// Atomic in Redis so concurrent requests across every API instance agree on
// one counter instead of each instance keeping its own — the reason the
// in-memory ThrottlerStorageService (the @nestjs/throttler default) doesn't
// work once there is more than one instance or a redeploy resets it.
//
// KEYS[1] hit counter, KEYS[2] block flag. Mirrors ThrottlerStorageService's
// semantics: hits stop incrementing once blocked, and the block persists for
// blockDuration independent of the hit-counter's own ttl.
const INCREMENT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttlMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDurationMs = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', hitsKey) or '0')
  local hitsTtl = redis.call('PTTL', hitsKey)
  if hitsTtl < 0 then hitsTtl = 0 end
  return { hits, hitsTtl, 1, blockTtl }
end

local hits = redis.call('INCR', hitsKey)
if hits == 1 then
  redis.call('PEXPIRE', hitsKey, ttlMs)
end
local hitsTtl = redis.call('PTTL', hitsKey)
if hitsTtl < 0 then hitsTtl = 0 end

if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockDurationMs)
  return { hits, hitsTtl, 1, blockDurationMs }
end

return { hits, hitsTtl, 0, 0 }
`;

interface MemoryEntry {
  hits: number;
  expiresAt: number;
  blockedUntil: number;
}

// How often the fallback Map is swept for entries whose hit-window and
// block have both lapsed. Redis expires its keys on its own (PEXPIRE); the
// in-memory stand-in has no such thing, so without this every distinct
// IP/email key ever throttled would stay in the Map forever — an unbounded
// leak on any process that runs long enough without Redis.
const MEMORY_SWEEP_INTERVAL_MS = 60_000;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly client: Redis | null;
  private readonly sweepInterval: NodeJS.Timeout | null;

  // Per-process fallback, used only when REDIS_URL isn't set (see the
  // warning below) — deliberately not the primary path. Limits kept here
  // reset on every redeploy and are never shared across instances, which is
  // the exact gap moving to Redis was meant to close. Kept as a documented
  // last resort rather than a hard boot failure, so a deploy isn't blocked
  // on provisioning Redis before the rest of the app can be verified.
  private readonly memoryStore = new Map<string, MemoryEntry>();

  constructor(redisUrl: string | undefined) {
    if (redisUrl) {
      this.client = new Redis(redisUrl);
      this.sweepInterval = null;
    } else {
      this.client = null;
      this.logger.warn(
        'REDIS_URL is not set — rate limiting is falling back to per-process, in-memory storage. ' +
          'Limits reset on every redeploy and are not shared across instances; see .env.example.',
      );
      this.sweepInterval = setInterval(() => this.sweepMemoryStore(), MEMORY_SWEEP_INTERVAL_MS);
      this.sweepInterval.unref?.();
    }
  }

  private sweepMemoryStore(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryStore) {
      if (entry.expiresAt <= now && entry.blockedUntil <= now) {
        this.memoryStore.delete(key);
      }
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    return this.client
      ? this.incrementRedis(key, ttl, limit, blockDuration, throttlerName)
      : this.incrementMemory(key, ttl, limit, blockDuration, throttlerName);
  }

  private async incrementRedis(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle-block:${throttlerName}:${key}`;

    const [totalHits, timeToExpireMs, isBlocked, timeToBlockExpireMs] = (await this.client!.eval(
      INCREMENT_SCRIPT,
      2,
      hitsKey,
      blockKey,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number, number];

    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpireMs / 1000),
      isBlocked: isBlocked === 1,
      timeToBlockExpire: Math.ceil(timeToBlockExpireMs / 1000),
    };
  }

  // Same semantics as the Lua script above, minus the cross-instance
  // atomicity Redis provides — a single process's Map is inherently
  // serialised per key already, so no lock is needed for that part.
  private incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ThrottlerStorageRecord {
    const now = Date.now();
    const storeKey = `${throttlerName}:${key}`;
    const existing = this.memoryStore.get(storeKey);

    if (existing && existing.blockedUntil > now) {
      return {
        totalHits: existing.hits,
        timeToExpire: Math.ceil(Math.max(existing.expiresAt - now, 0) / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil((existing.blockedUntil - now) / 1000),
      };
    }

    const entry: MemoryEntry =
      existing && existing.expiresAt > now
        ? existing
        : { hits: 0, expiresAt: now + ttl, blockedUntil: 0 };

    entry.hits += 1;
    if (entry.hits > limit) {
      entry.blockedUntil = now + blockDuration;
    }
    this.memoryStore.set(storeKey, entry);

    return {
      totalHits: entry.hits,
      timeToExpire: Math.ceil(Math.max(entry.expiresAt - now, 0) / 1000),
      isBlocked: entry.blockedUntil > now,
      timeToBlockExpire: entry.blockedUntil > now ? Math.ceil(blockDuration / 1000) : 0,
    };
  }

  async onModuleDestroy() {
    this.client?.disconnect();
    if (this.sweepInterval) clearInterval(this.sweepInterval);
  }
}
