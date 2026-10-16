import { Logger } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/**
 * Atomic hit counter + block flag. One round-trip per request, so concurrent
 * replicas can't race between reading and incrementing.
 *
 * KEYS[1] hits key · KEYS[2] block key
 * ARGV[1] ttl ms   · ARGV[2] limit    · ARGV[3] block duration ms
 * Returns { totalHits, hitsTtlMs, isBlocked (0|1), blockTtlMs }.
 */
const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return { hits, redis.call('PTTL', KEYS[1]), 1, blockTtl }
end
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, ttl, 1, tonumber(ARGV[3]) }
end
return { hits, ttl, 0, 0 }
`;

/**
 * Throttler storage shared across backend replicas via Redis.
 *
 * The default @nestjs/throttler storage is an in-process Map, so with N
 * replicas every client effectively gets N× the configured limit. When
 * REDIS_URL is set this keeps one counter per client in Redis instead.
 *
 * Without REDIS_URL — or if a Redis call fails — it falls back to the
 * in-memory storage, so rate limiting degrades rather than blocking traffic.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly memory = new ThrottlerStorageService();
  private redis: Redis | null = null;

  constructor(redisUrl?: string) {
    if (!redisUrl) return;
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    this.redis.on('error', (err: Error) => this.logger.warn(`Throttler Redis error: ${err.message}`));
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis || this.redis.status !== 'ready') {
      return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    }
    try {
      const base = `throttle:${throttlerName}:${key}`;
      const [totalHits, hitsTtlMs, blocked, blockTtlMs] = (await this.redis.eval(
        INCREMENT_SCRIPT, 2, `${base}:hits`, `${base}:block`, ttl, limit, blockDuration,
      )) as number[];
      return {
        totalHits,
        // The built-in storage reports these in whole seconds.
        timeToExpire: Math.ceil(Math.max(hitsTtlMs, 0) / 1000),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.ceil(Math.max(blockTtlMs, 0) / 1000),
      };
    } catch (err: any) {
      this.logger.warn(`Throttler Redis call failed (${err?.message}) — using in-memory limits`);
      return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
