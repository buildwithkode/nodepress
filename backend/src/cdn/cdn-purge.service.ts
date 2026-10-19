import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHmac } from 'crypto';
import { env } from '../config/env';
import { JobsService } from '../jobs/jobs.service';

export const CDN_PURGE_JOB = 'cdn.purge';

/** Tag on every public API response — purging it clears all of them. */
export const ALL_TAG = 'np-all';
export const contentTypeTag = (contentTypeId: number) => `np-ct-${contentTypeId}`;

/** Collect purges for this long, so a burst of writes becomes one CDN call. */
const BATCH_MS = 2_000;
/** Cloudflare accepts at most 30 tags per purge request. */
const CLOUDFLARE_TAG_CHUNK = 30;
const TIMEOUT_MS = 10_000;

/** s-maxage for public API responses (see HttpCacheInterceptor). */
export function cdnCacheTtl(): number {
  return env.CDN_CACHE_TTL ?? (env.CDN_PURGE_DRIVER === 'none' ? 30 : 3600);
}

/** The Cache-Tag / Surrogate-Key values for a content type's public responses. */
export function publicCacheTags(contentTypeId: number): string[] {
  return [ALL_TAG, contentTypeTag(contentTypeId)];
}

/**
 * Purges CDN-cached public API responses when content changes.
 *
 * DynamicApiService calls `schedule()` from the same Prisma middleware that
 * invalidates the server cache, so every write path is covered. Tags are
 * batched for BATCH_MS, then queued as one `cdn.purge` job — retried with
 * backoff if the CDN API fails, and not lost on restart.
 *
 * "Everything changed" purges the `np-all` tag, never a whole Cloudflare zone,
 * which could hold the rest of the site.
 */
@Injectable()
export class CdnPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CdnPurgeService.name);
  private pending = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly jobs: JobsService) {}

  get enabled(): boolean {
    return env.CDN_PURGE_DRIVER !== 'none';
  }

  onModuleInit() {
    this.jobs.registerHandler(CDN_PURGE_JOB, (payload: { tags: string[] }) => this.purge(payload.tags));
  }

  async onModuleDestroy() {
    await this.flush();
  }

  /** Queue a purge of these content types (or everything). No-op without a driver. */
  schedule(scope: number[] | 'all') {
    if (!this.enabled) return;
    if (scope === 'all') this.pending.add(ALL_TAG);
    else for (const id of scope) this.pending.add(contentTypeTag(id));
    if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), BATCH_MS);
      this.timer.unref?.();
    }
  }

  /** Turn the batched tags into one purge job. */
  async flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.pending.size === 0) return;
    // np-all covers every other tag.
    const tags = this.pending.has(ALL_TAG) ? [ALL_TAG] : [...this.pending];
    this.pending = new Set();
    try {
      await this.jobs.enqueue(CDN_PURGE_JOB, { tags }, { maxAttempts: 5 });
    } catch (err: any) {
      this.logger.error(`Could not queue CDN purge for ${tags.join(', ')}: ${err?.message}`);
    }
  }

  /** Call the CDN. Throws on failure so the job is retried. */
  async purge(tags: string[]): Promise<void> {
    if (!tags?.length) return;
    switch (env.CDN_PURGE_DRIVER) {
      case 'cloudflare':
        for (let i = 0; i < tags.length; i += CLOUDFLARE_TAG_CHUNK) {
          await this.post(
            `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`,
            { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
            JSON.stringify({ tags: tags.slice(i, i + CLOUDFLARE_TAG_CHUNK) }),
          );
        }
        break;
      case 'fastly':
        await this.post(
          `https://api.fastly.com/service/${env.FASTLY_SERVICE_ID}/purge`,
          { 'Fastly-Key': env.FASTLY_API_TOKEN!, 'Surrogate-Key': tags.join(' ') },
          undefined,
        );
        break;
      case 'webhook': {
        const body = JSON.stringify({ event: 'cdn.purge', tags, timestamp: new Date().toISOString() });
        const headers: Record<string, string> = {};
        if (env.CDN_PURGE_WEBHOOK_SECRET) {
          headers['X-NodePress-Signature'] = `sha256=${createHmac('sha256', env.CDN_PURGE_WEBHOOK_SECRET).update(body).digest('hex')}`;
        }
        await this.post(env.CDN_PURGE_WEBHOOK_URL!, headers, body);
        break;
      }
      default:
        return;
    }
    this.logger.log(`CDN purge (${env.CDN_PURGE_DRIVER}): ${tags.join(', ')}`);
  }

  private async post(url: string, headers: Record<string, string>, body: string | undefined) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`CDN purge failed: HTTP ${res.status} ${detail}`);
    }
  }
}
