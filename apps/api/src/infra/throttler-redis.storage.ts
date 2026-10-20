import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { keys } from './redis.js';

/**
 * Fixed-window rate limiting shared by every API instance (atomic Lua script).
 * Returns the shape @nestjs/throttler expects. Times are milliseconds.
 */
const SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local block = tonumber(ARGV[3])
local blockedTtl = redis.call('PTTL', blockKey)
if blockedTtl > 0 then
  return { limit + 1, redis.call('PTTL', hitsKey), 1, blockedTtl }
end
local hits = redis.call('INCR', hitsKey)
if hits == 1 then redis.call('PEXPIRE', hitsKey, ttl) end
local remaining = redis.call('PTTL', hitsKey)
if hits > limit then
  redis.call('SET', blockKey, '1', 'PX', block)
  return { hits, remaining, 1, block }
end
return { hits, remaining, 0, 0 }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    const base = keys.throttle(`${throttlerName}:${key}`);
    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = (await this.redis.eval(
      SCRIPT,
      2,
      `${base}:hits`,
      `${base}:block`,
      ttl,
      limit,
      Math.max(blockDuration, 1),
    )) as [number, number, number, number];
    return {
      totalHits,
      timeToExpire: Math.ceil(Math.max(timeToExpire, 0) / 1000),
      isBlocked: isBlocked === 1,
      timeToBlockExpire: Math.ceil(Math.max(timeToBlockExpire, 0) / 1000),
    };
  }
}
