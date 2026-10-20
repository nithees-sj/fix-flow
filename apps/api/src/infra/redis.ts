import { Redis, type RedisOptions } from 'ioredis';

/** Shared options; BullMQ workers additionally require maxRetriesPerRequest = null. */
export function createRedis(url: string, opts: RedisOptions = {}): Redis {
  return new Redis(url, { lazyConnect: false, enableReadyCheck: true, ...opts });
}

/** Redis key namespace helpers (kept in one place so invalidation is easy to audit). */
export const keys = {
  revokedSession: (sid: string) => `ff:revoked-session:${sid}`,
  membership: (orgId: string, userId: string) => `ff:membership:${orgId}:${userId}`,
  realtimeTicket: (ticket: string) => `ff:rt-ticket:${ticket}`,
  throttle: (key: string) => `ff:throttle:${key}`,
};
