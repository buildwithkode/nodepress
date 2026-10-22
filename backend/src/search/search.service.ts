import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { env } from '../config/env';
import { idsIn, isCachedWrite, scopeFromArgs, WriteParams } from '../dynamic-api/cache-scope';

export const SEARCH_SYNC_JOB = 'search.sync';

/** What a search adapter returns: matching entry ids in rank order, and the total. */
export interface SearchPage {
  ids: number[];
  total: number;
}

interface SyncPayload {
  entryIds?: number[];
  contentTypeIds?: number[];
  all?: boolean;
}

/** Wait this long before syncing, so a write inside a transaction has committed. */
const SYNC_DELAY_MS = 2_000;
const BATCH = 500;

/** Every string in an entry's data, HTML stripped — what the external index searches. */
export function searchableText(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    // Relation UUIDs and URLs add noise, not meaning.
    if (!/^[0-9a-f-]{36}$/i.test(value) && !/^https?:\/\//.test(value)) {
      out.push(value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    }
  } else if (Array.isArray(value)) {
    value.forEach((v) => searchableText(v, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) if (k !== '_id' && k !== '_layout') searchableText(v, out);
  }
  return out;
}

/**
 * Optional external search (SEARCH_DRIVER=meilisearch). Postgres full-text
 * search stays the default and the fallback: when Meilisearch is off, errors
 * out, or the query needs language fallback, the dynamic API uses Postgres.
 *
 * The index holds published, non-deleted entries only. Every Entry/ContentType
 * write queues a `search.sync` job (same operation hook as the public cache),
 * so writes from any service keep it current; POST /api/search/reindex rebuilds it.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private configured = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  /** True when searches go to Meilisearch. */
  get external(): boolean {
    return env.SEARCH_DRIVER === 'meilisearch' && !!env.MEILISEARCH_URL;
  }

  status() {
    return { driver: this.external ? 'meilisearch' : 'postgres', index: this.external ? env.MEILISEARCH_INDEX : null };
  }

  onModuleInit() {
    if (!this.external) return;
    this.jobs.registerHandler(SEARCH_SYNC_JOB, (p: SyncPayload) => this.sync(p));
    if (typeof this.prisma.onOperation === 'function') {
      this.prisma.onOperation(async (params, next) => {
        const result = await next(params);
        if (isCachedWrite(params as WriteParams)) {
          await this.queueFor(params as WriteParams, result).catch((err) =>
            this.logger.warn(`Couldn't queue a search sync: ${err?.message}`),
          );
        }
        return result;
      });
    }
  }

  /** Queue a full rebuild. */
  reindex() {
    return this.jobs.enqueue(SEARCH_SYNC_JOB, { all: true }, { delayMs: 0 });
  }

  async search(contentTypeId: number, term: string, opts: { locale?: string; limit: number; offset: number }): Promise<SearchPage> {
    await this.ensureSettings();
    const filter = [`contentTypeId = ${Number(contentTypeId)}`];
    if (opts.locale) filter.push(`locale = ${JSON.stringify(opts.locale)}`);
    const res = await this.meili('POST', `/indexes/${this.index}/search`, {
      q: term,
      filter: filter.join(' AND '),
      limit: opts.limit,
      offset: opts.offset,
      attributesToRetrieve: ['id'],
    });
    return { ids: (res.hits ?? []).map((h: any) => Number(h.id)), total: res.estimatedTotalHits ?? res.totalHits ?? 0 };
  }

  private async queueFor(p: WriteParams, result: any) {
    let payload: SyncPayload;
    if (p.model === 'ContentType') {
      const id = typeof result?.id === 'number' ? [result.id] : idsIn(p.args?.where?.id);
      payload = id ? { contentTypeIds: id } : { all: true };
    } else if (result && typeof result.id === 'number') {
      payload = { entryIds: [result.id] };
    } else {
      const ids = idsIn(p.args?.where?.id);
      const scope = scopeFromArgs(p);
      payload = ids ? { entryIds: ids } : Array.isArray(scope) ? { contentTypeIds: scope } : { all: true };
    }
    await this.jobs.enqueue(SEARCH_SYNC_JOB, payload as Record<string, any>, { delayMs: SYNC_DELAY_MS });
  }

  /** Make the index match the database for the given entries / types / everything. */
  async sync(p: SyncPayload) {
    await this.ensureSettings();
    if (p.entryIds?.length) {
      const rows = await this.prisma.entry.findMany({ where: { id: { in: p.entryIds } } });
      const live = rows.filter((r) => r.status === 'published' && !r.deletedAt);
      if (live.length) await this.upsert(live);
      const gone = p.entryIds.filter((id) => !live.some((r) => r.id === id));
      if (gone.length) await this.meili('POST', `/indexes/${this.index}/documents/delete-batch`, gone);
      return;
    }
    if (p.contentTypeIds?.length) {
      for (const ct of p.contentTypeIds) {
        await this.meili('POST', `/indexes/${this.index}/documents/delete`, { filter: `contentTypeId = ${Number(ct)}` });
      }
    } else {
      await this.meili('DELETE', `/indexes/${this.index}/documents`);
    }
    const where = {
      status: 'published',
      deletedAt: null,
      ...(p.contentTypeIds?.length ? { contentTypeId: { in: p.contentTypeIds } } : {}),
    };
    for (let cursor = 0; ; ) {
      const rows = await this.prisma.entry.findMany({ where: { ...where, id: { gt: cursor } }, orderBy: { id: 'asc' }, take: BATCH });
      if (!rows.length) break;
      await this.upsert(rows);
      cursor = rows[rows.length - 1].id;
    }
  }

  private upsert(rows: Array<{ id: number; contentTypeId: number; locale: string; slug: string; data: unknown }>) {
    return this.meili(
      'POST',
      `/indexes/${this.index}/documents?primaryKey=id`,
      rows.map((r) => ({
        id: r.id,
        contentTypeId: r.contentTypeId,
        locale: r.locale,
        slug: r.slug,
        text: searchableText(r.data).join(' \n'),
      })),
    );
  }

  private async ensureSettings() {
    if (this.configured) return;
    await this.meili('PATCH', `/indexes/${this.index}/settings`, {
      filterableAttributes: ['contentTypeId', 'locale'],
      searchableAttributes: ['slug', 'text'],
    });
    this.configured = true;
  }

  private get index() {
    return encodeURIComponent(env.MEILISEARCH_INDEX);
  }

  private async meili(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${env.MEILISEARCH_URL!.replace(/\/+$/, '')}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(env.MEILISEARCH_KEY ? { Authorization: `Bearer ${env.MEILISEARCH_KEY}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Meilisearch ${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
}
