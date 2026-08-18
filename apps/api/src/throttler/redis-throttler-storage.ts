import { Injectable, OnModuleDestroy } from '@nestjs/common';
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

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle-block:${throttlerName}:${key}`;

    const [totalHits, timeToExpireMs, isBlocked, timeToBlockExpireMs] = (await this.client.eval(
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

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
