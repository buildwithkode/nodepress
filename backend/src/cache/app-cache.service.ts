import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';

interface MemoryEntry<T> {
  value: T;
  exp: number;
}

/**
 * TTL cache with automatic Redis upgrade.
 *
 * - When REDIS_URL is set: delegates to Redis (shared across instances, survives restarts).
 * - Otherwise: falls back to an in-process Map (single-instance, zero infrastructure).
 *
 * All methods are async so callers work identically in both modes.
 */
@Injectable()
export class AppCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppCacheService.name);
  private store  = new Map<string, MemoryEntry<unknown>>();
  private redis: import('ioredis').Redis | null = null;

  async onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) return;

    try {
      const { default: Redis } = await import('ioredis');
      this.redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
      });
      await this.redis.connect();
      this.logger.log('Cache: connected to Redis');
    } catch (err: any) {
      this.logger.warn(`Cache: Redis connection failed (${err?.message}) — falling back to in-memory`);
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.redis) {
      const raw = await this.redis.get(key).catch(() => null);
      if (raw === null) return undefined;
      try { return JSON.parse(raw) as T; } catch { return undefined; }
    }

    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.exp) { this.store.delete(key); return undefined; }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs = 30_000): Promise<void> {
    if (this.redis) {
      await this.redis.set(key, JSON.stringify(value), 'PX', ttlMs).catch(() => null);
      return;
    }
    this.store.set(key, { value, exp: Date.now() + ttlMs });
  }

  /** Delete every key that starts with `prefix`.
   *  In Redis mode uses SCAN to avoid blocking; in memory mode iterates the Map. */
  async invalidatePrefix(prefix: string): Promise<void> {
    if (this.redis) {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100).catch((): [string, string[]] => ['0', []]);
        cursor = next;
        if (keys.length > 0) await this.redis.del(...keys).catch(() => null);
      } while (cursor !== '0');
      return;
    }

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Atomic increment — returns the new count. Sets TTL on first call within the window.
   *  Used by the API key rate limiter (fixed window per minute). */
  async increment(key: string, ttlMs = 60_000): Promise<number> {
    if (this.redis) {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.pexpire(key, ttlMs).catch(() => null);
      return count;
    }

    const entry = this.store.get(key);
    const now = Date.now();
    if (!entry || now > entry.exp) {
      this.store.set(key, { value: 1 as unknown, exp: now + ttlMs });
      return 1;
    }
    const next = (entry.value as number) + 1;
    entry.value = next as unknown;
    return next;
  }

  get size(): number {
    return this.store.size;
  }
}
