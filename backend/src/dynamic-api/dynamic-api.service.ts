import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
  Optional,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';
import { CdnPurgeService, publicCacheTags } from '../cdn/cdn-purge.service';
import {
  CacheScope, WriteParams, changedNothing, entryIdsToLookUp, isCachedWrite, scopeFromArgs, scopeFromResult,
} from './cache-scope';
import { WebhooksService } from '../webhooks/webhooks.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PluginHookBus } from '../plugin/plugin-hook-bus';
import { PluginEvents } from '../plugin/plugin.events';
import { normalizeDataKeys, injectRepeaterIds, needsRepeaterIds } from '../common/normalize';
import { sanitizeEntryData } from '../common/sanitize';
import { FieldDef } from '../fields/field.types';
import { populateDeep, populateManyDeep } from '../common/populate.util';
import { filterUnauthorizedReadFields, validateFieldWritePermissions } from '../common/field-security.util';
import { buildAdvancedWhere } from '../common/filter-query.util';

type MethodKey = 'list' | 'read' | 'create' | 'update' | 'delete';

type SortDirection = 'asc' | 'desc';
type SortableField = 'createdAt' | 'updatedAt' | 'slug';

export interface PublicListQuery {
  page?: number;
  limit?: number;
  cursor?: string;                  // opaque keyset cursor from a previous meta.nextCursor (replaces page)
  sort?: string;                    // e.g. "createdAt:desc" or "slug:asc"
  filter?: Record<string, string>;  // legacy simple filter e.g. { category: "tech" }
  where?: Record<string, any>;      // advanced where query e.g. { price: { gte: 100 }, category: { in: ["tech", "news"] } }
  search?: string;                  // full-text search on slug + data
  locale?: string;                  // filter by locale (e.g. "en", "fr")
  stage?: 'published' | 'staging' | 'draft' | 'all'; // Environment stage targeting
  populate?: string[];              // relation field names to inline-populate
  fields?: string[];                // field projection — only return listed data keys
}

export interface PublicSingleQuery {
  locale?: string;   // default: "en"
  stage?: 'published' | 'staging' | 'draft' | 'all';
  populate?: string[];
  fields?: string[];                // field projection — only return listed data keys
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    /** Omitted in cursor mode — counting every row is what cursor paging avoids. */
    total?: number;
    page?: number;
    limit: number;
    totalPages?: number;
    /** Pass as ?cursor= to fetch the next page; null on the last page. Absent for search results. */
    nextCursor?: string | null;
    /** Present when a search was executed. "fulltext" = PostgreSQL GIN index used.
     *  "fallback" = fell back to LIKE (e.g. single character or special syntax). */
    searchMode?: 'fulltext' | 'fallback';
  };
}

const SORTABLE: Record<string, SortableField> = {
  createdAt: 'createdAt',
  updatedat: 'updatedAt',
  updatedAt: 'updatedAt',
  slug: 'slug',
};

/** Cache TTL: 30 s for lists, 60 s for single entries, 5 min for content-type meta */
const LIST_TTL         = 30_000;
const ENTRY_TTL        = 60_000;
const CONTENT_TYPE_TTL = 300_000;

const ctCacheKey     = (typeName: string) => `ct:meta:${typeName}`;

/**
 * Public responses are cached under `dyn:<global>.<type>:<contentTypeId>:…`,
 * where <type> is a per-content-type generation counter. A write to an entry or
 * content type — from this API, the admin panel, the scheduler, imports or
 * plugins — bumps only the generations of the content types it touched (one
 * O(1) INCR each), so their cached responses become unreachable and simply
 * expire while every other type stays cached. The global generation is the
 * fallback when a write's content type can't be determined. Both live in the
 * shared cache, so they hold across replicas.
 */
const GLOBAL_GENERATION_KEY = 'dyn:generation';
const typeGenerationKey = (contentTypeId: number) => `dyn:generation:${contentTypeId}`;
const GENERATION_TTL = 365 * 24 * 60 * 60_000;

/**
 * After a write, reads of the written content type go to the primary for this
 * long so a lagging read replica can't put the pre-write row back into the cache.
 */
const RECENT_WRITE_KEY = 'replica:recent-write';
const typeRecentWriteKey = (contentTypeId: number) => `replica:recent-write:${contentTypeId}`;
const READ_AFTER_WRITE_MS = Number(process.env.REPLICA_READ_AFTER_WRITE_MS) || 5_000;

/** What a public read needs to know about the cache for one content type. */
interface CacheState { prefix: string; recentWrite: boolean }

/** Parse "field:direction" → sort field + direction */
function parseSortParam(sort?: string): { field: SortableField; direction: SortDirection } {
  if (!sort) return { field: 'createdAt', direction: 'desc' };
  const [rawField, rawDir] = sort.split(':');
  const field = SORTABLE[rawField] ?? 'createdAt';
  const direction: SortDirection = rawDir === 'asc' ? 'asc' : 'desc';
  return { field, direction };
}

/**
 * Keyset cursor: the sort key + id of the last row on a page, base64url-encoded.
 * Paging by cursor is O(limit) at any depth, whereas OFFSET makes Postgres walk
 * past every skipped row, and it skips the per-request COUNT(*).
 */
interface CursorPayload { s: string; v: string; id: number }

function encodeCursor(field: SortableField, direction: SortDirection, row: Record<string, any>): string {
  const value = row[field] instanceof Date ? row[field].toISOString() : String(row[field]);
  const payload: CursorPayload = { s: `${field}:${direction}`, v: value, id: row.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string, field: SortableField, direction: SortDirection): CursorPayload {
  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
  if (!payload || typeof payload.v !== 'string' || !Number.isInteger(payload.id)) {
    throw new BadRequestException('Invalid cursor');
  }
  if (payload.s !== `${field}:${direction}`) {
    throw new BadRequestException('Cursor was issued for a different sort order');
  }
  return payload;
}

/**
 * WHERE clause selecting rows strictly after the cursor in (field, id) order.
 *
 * Written as `field <= v AND (field < v OR id < c)` rather than the textbook
 * `field < v OR (field = v AND id < c)`: the leading range condition lets
 * Postgres start the index scan at the cursor. The OR-only form can't, and
 * filters every earlier row — measured at 88 ms vs 0.04 ms, 100k rows deep.
 */
function cursorWhere(field: SortableField, direction: SortDirection, c: CursorPayload) {
  const value = field === 'slug' ? c.v : new Date(c.v);
  const strict = direction === 'desc' ? 'lt' : 'gt';
  const inclusive = direction === 'desc' ? 'lte' : 'gte';
  return {
    AND: [
      { [field]: { [inclusive]: value } },
      { OR: [{ [field]: { [strict]: value } }, { id: { [strict]: c.id } }] },
    ],
  };
}

/**
 * Apply field projection to an entry's data object.
 * When `fields` is empty/undefined the full data is returned unchanged.
 * Non-data envelope fields (id, slug, locale, createdAt, updatedAt) are
 * always included regardless of the projection.
 */
function projectFields(
  entry: Record<string, any>,
  fields: string[] | undefined,
): Record<string, any> {
  if (!fields || fields.length === 0) return entry;
  const projected = { ...entry };
  if (projected.data && typeof projected.data === 'object') {
    const filteredData: Record<string, any> = {};
    for (const key of fields) {
      if (key in projected.data) filteredData[key] = projected.data[key];
    }
    projected.data = filteredData;
  }
  return projected;
}

/** Build Prisma JSON-path where clauses from filter object */
function buildDataFilters(filter: Record<string, string>) {
  return Object.entries(filter).map(([key, value]) => ({
    data: {
      path: [key],
      string_contains: value,
    },
  }));
}

@Injectable()
export class DynamicApiService implements OnModuleInit {
  private readonly logger = new Logger(DynamicApiService.name);

  constructor(
    private prisma: PrismaService,
    private cache: AppCacheService,
    private jwtService: JwtService,
    private webhooks: WebhooksService,
    private realtime: RealtimeGateway,
    @Optional() private hookBus?: PluginHookBus,
    @Optional() private cdn?: CdnPurgeService,
  ) {}

  onModuleInit() {
    // Prisma middleware sees every Entry/ContentType write in the process,
    // whichever service makes it, so no write path can forget to invalidate.
    if (typeof this.prisma.$use !== 'function') return; // mocked in unit tests
    this.prisma.$use((params, next) => this.invalidatingWrite(params, next));
  }

  /** Run a write, then drop the cached responses of the content types it touched. */
  async invalidatingWrite(params: WriteParams, next: (params: any) => Promise<any>): Promise<any> {
    if (!isCachedWrite(params)) return next(params);

    let scope = scopeFromArgs(params);
    // A hard delete removes the rows the content type would be looked up from.
    if (scope === null && params.action.startsWith('delete')) scope = await this.lookUpEntryTypes(params);

    const result = await next(params);
    if (changedNothing(result)) return result; // e.g. a scheduler run with nothing due

    scope ??= scopeFromResult(params, result) ?? (await this.lookUpEntryTypes(params));
    await this.invalidateScope(scope ?? 'all');
    return result;
  }

  private async lookUpEntryTypes(params: WriteParams): Promise<number[] | null> {
    const ids = entryIdsToLookUp(params);
    if (!ids) return null;
    try {
      const rows = await this.prisma.entry.findMany({
        where: { id: { in: ids } },
        select: { contentTypeId: true },
        distinct: ['contentTypeId'],
      });
      return rows.map((r) => r.contentTypeId);
    } catch {
      return null;
    }
  }

  private async resolveContentType(typeName: string, method: MethodKey) {
    const name = typeName.trim().toLowerCase().replace(/[\s-]+/g, '_');

    // Cache content type meta for 5 minutes — avoids a DB round-trip on every
    // public API request. The content-type service clears it on schema changes.
    const cacheKey = ctCacheKey(name);
    let contentType = await this.cache.get<any>(cacheKey);

    if (!contentType) {
      contentType = await this.prisma.contentType.findUnique({ where: { name } });
      if (contentType) {
        await this.cache.set(cacheKey, contentType, CONTENT_TYPE_TTL);
      }
    }

    if (!contentType) {
      throw new NotFoundException(`Content type "${name}" does not exist`);
    }

    const allowed = contentType.allowedMethods as string[] | null;
    if (allowed !== null && !allowed.includes(method)) {
      throw new ForbiddenException(`Method "${method}" is not allowed on content type "${name}"`);
    }

    return contentType;
  }

  /** Map internal entry row → public-facing shape (UUID as id, no deletedAt) */
  private toPublicEntry(e: any, data: Record<string, any>) {
    const { id: _internal, publicId, deletedAt: _del, status: _st, ...rest } = e;
    return { id: publicId, ...rest, data };
  }

  /** Make the cached public responses of some (or all) content types stale. */
  private async invalidateScope(scope: CacheScope) {
    const ops = scope === 'all'
      ? [
          this.cache.increment(GLOBAL_GENERATION_KEY, GENERATION_TTL),
          this.cache.set(RECENT_WRITE_KEY, 1, READ_AFTER_WRITE_MS),
        ]
      : scope.flatMap((id) => [
          this.cache.increment(typeGenerationKey(id), GENERATION_TTL),
          this.cache.set(typeRecentWriteKey(id), 1, READ_AFTER_WRITE_MS),
        ]);
    try {
      await Promise.all(ops);
    } catch (err: any) {
      // The write itself already succeeded; cached responses expire on their TTL.
      this.logger.warn(`Public cache invalidation failed: ${err?.message}`);
    }
    this.cdn?.schedule(scope);
  }

  /** Cache-Tag values for a content type's public responses (for CDN purging). */
  async publicCacheTags(typeName: string): Promise<string[]> {
    const name = typeName.trim().toLowerCase().replace(/[\s-]+/g, '_');
    let contentType = await this.cache.get<any>(ctCacheKey(name));
    if (!contentType) contentType = await this.prisma.contentType.findUnique({ where: { name }, select: { id: true } });
    return contentType ? publicCacheTags(contentType.id) : [];
  }

  /** Cache key prefix and read-after-write flag for a content type, in one round trip. */
  private async cacheState(contentTypeId: number): Promise<CacheState> {
    const [globalGen, typeGen, recentAll, recentType] = await this.cache.getMany<number>([
      GLOBAL_GENERATION_KEY,
      typeGenerationKey(contentTypeId),
      RECENT_WRITE_KEY,
      typeRecentWriteKey(contentTypeId),
    ]);
    return {
      prefix: `dyn:${globalGen ?? 0}.${typeGen ?? 0}:${contentTypeId}:`,
      recentWrite: !!(recentAll || recentType),
    };
  }

  /**
   * Client for a public read: the read replica when configured, except right
   * after a write to the same content type (see READ_AFTER_WRITE_MS).
   */
  private readClient(state: CacheState): PrismaClient {
    const replica = this.prisma.readReplica;
    return replica && !state.recentWrite ? replica : this.prisma;
  }

  async findAll(typeName: string, query: PublicListQuery = {}): Promise<PaginatedResult<any>> {
    const contentType = await this.resolveContentType(typeName, 'list');

    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip  = (page - 1) * limit;
    const { field: sortField, direction: sortDir } = parseSortParam(query.sort);
    // id is a tiebreaker so pages never skip or repeat rows sharing a timestamp.
    const orderBy = [{ [sortField]: sortDir }, { id: sortDir }];
    if (query.cursor && query.search) {
      throw new BadRequestException('cursor cannot be combined with search — use page instead');
    }
    const cursor = query.cursor ? decodeCursor(query.cursor, sortField, sortDir) : null;

    // ── Cache lookup ──────────────────────────────────────────────────────────
    // populate/fields responses vary per request and aren't cached, so they must
    // also skip the cache read (the key omits populate/fields) — otherwise a
    // populated list could be served raw, or vice versa.
    const cacheable = (!query.fields || query.fields.length === 0) && (!query.populate || query.populate.length === 0);
    const state = await this.cacheState(contentType.id);
    const cacheKey = `${state.prefix}list:${JSON.stringify({ page, limit, cursor: query.cursor, sort: query.sort, search: query.search, filter: query.filter, where: query.where, locale: query.locale, stage: query.stage })}`;
    if (cacheable) {
      const cached = await this.cache.get<PaginatedResult<any>>(cacheKey);
      if (cached) return cached;
    }

    const db = this.readClient(state);

    // Build status condition based on environment stage targeting
    const statusFilter = query.stage === 'staging'
      ? { in: ['staging', 'published'] }
      : query.stage === 'draft'
        ? { in: ['draft', 'pending_review', 'staging', 'published'] }
        : query.stage === 'all'
          ? undefined
          : 'published';

    // Build where: filtered by stage + non-deleted entries
    const advancedWhere = buildAdvancedWhere(query.where, query.filter);
    const where: any = {
      contentTypeId: contentType.id,
      ...(statusFilter ? { status: statusFilter } : {}),
      deletedAt: null,
      ...(query.locale ? { locale: query.locale } : {}),
      ...(advancedWhere.length > 0 ? { AND: advancedWhere } : {}),
    };

    // ── Full-text search ──────────────────────────────────────────────────────
    // Uses the entries_search_vector_idx GIN index (generated search_vector column) with DB-level pagination
    // to prevent memory exhaustion and Postgres parameter overflow on large datasets.
    // Falls back to LIKE for short/special-char queries tsquery rejects.
    let searchMode: 'fulltext' | 'fallback' | undefined;
    let total = 0;
    let entries: any[] = [];
    let hasMore = false;

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      let matches: { id: number }[] = [];
      try {
        const countResult = await db.$queryRaw<any[]>`
          SELECT count(*)::int AS count FROM entries
          WHERE "contentTypeId" = ${contentType.id}
            AND status = 'published'
            AND "deletedAt" IS NULL
            ${query.locale ? Prisma.sql`AND locale = ${query.locale}` : Prisma.empty}
            AND search_vector @@ websearch_to_tsquery('english', ${term})
        `;
        total = countResult[0]?.count != null ? Number(countResult[0].count) : countResult.length;

        if (total > 0) {
          const res = await db.$queryRaw<{ id: number }[]>`
            SELECT id FROM entries
            WHERE "contentTypeId" = ${contentType.id}
              AND status = 'published'
              AND "deletedAt" IS NULL
              ${query.locale ? Prisma.sql`AND locale = ${query.locale}` : Prisma.empty}
              AND search_vector @@ websearch_to_tsquery('english', ${term})
            ORDER BY "createdAt" DESC
            LIMIT ${limit} OFFSET ${skip}
          `;
          matches = Array.isArray(res) ? res : (countResult[0]?.id != null ? countResult : []);
        }
        searchMode = 'fulltext';
      } catch {
        // Fallback: plain LIKE for short/special-char queries that tsquery can't parse
        const like = `%${term}%`;
        const countResult = await db.$queryRaw<any[]>`
          SELECT count(*)::int AS count FROM entries
          WHERE "contentTypeId" = ${contentType.id}
            AND status = 'published'
            AND "deletedAt" IS NULL
            ${query.locale ? Prisma.sql`AND locale = ${query.locale}` : Prisma.empty}
            AND (LOWER(slug) LIKE LOWER(${like}) OR LOWER(COALESCE(data::text, '')) LIKE LOWER(${like}))
        `;
        total = countResult[0]?.count != null ? Number(countResult[0].count) : countResult.length;

        if (total > 0) {
          const res = await db.$queryRaw<{ id: number }[]>`
            SELECT id FROM entries
            WHERE "contentTypeId" = ${contentType.id}
              AND status = 'published'
              AND "deletedAt" IS NULL
              ${query.locale ? Prisma.sql`AND locale = ${query.locale}` : Prisma.empty}
              AND (LOWER(slug) LIKE LOWER(${like}) OR LOWER(COALESCE(data::text, '')) LIKE LOWER(${like}))
            ORDER BY "createdAt" DESC
            LIMIT ${limit} OFFSET ${skip}
          `;
          matches = Array.isArray(res) ? res : (countResult[0]?.id != null ? countResult : []);
        }
        searchMode = 'fallback';
      }

      if (matches && matches.length > 0) {
        const pageIds = matches.map((m) => m.id);
        const rawEntries = await db.entry.findMany({
          where: { id: { in: pageIds } },
          select: {
            id: true, publicId: true, slug: true, locale: true,
            status: true, deletedAt: true, data: true, seo: true,
            createdAt: true, updatedAt: true,
          },
        });
        const entryMap = new Map(rawEntries.map((e) => [e.id, e]));
        entries = pageIds.map((id) => entryMap.get(id)).filter(Boolean);
      } else {
        entries = [];
      }
    } else if (cursor) {
      // Fetch one extra row to learn whether another page exists, without COUNT(*).
      const rows = await db.entry.findMany({
        where: { AND: [where, cursorWhere(sortField, sortDir, cursor)] },
        orderBy,
        take: limit + 1,
        select: {
          id: true, publicId: true, slug: true, locale: true,
          status: true, deletedAt: true, data: true, seo: true,
          createdAt: true, updatedAt: true,
        },
      });
      hasMore = rows.length > limit;
      entries = rows.slice(0, limit);
    } else {
      const [countedTotal, fetchedEntries] = await Promise.all([
        db.entry.count({ where }),
        db.entry.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          select: {
            id: true, publicId: true, slug: true, locale: true,
            status: true, deletedAt: true, data: true, seo: true,
            createdAt: true, updatedAt: true,
          },
        }),
      ]);
      total = countedTotal;
      entries = fetchedEntries;
    }

    // Process repeater IDs in memory for response (pure read-only)
    const processed = entries.map((e) => {
      let entryData = normalizeDataKeys(e.data as Record<string, any>);
      if (needsRepeaterIds(entryData)) {
        entryData = injectRepeaterIds(entryData);
      }
      return { e, entryData };
    });

    const schema = contentType.schema as unknown as FieldDef[];
    let populatedDataList: Record<string, any>[];

    if (query.populate?.length) {
      const dataList = processed.map((p) => p.entryData);
      populatedDataList = await populateManyDeep(dataList, schema, query.populate, db);
    } else {
      populatedDataList = processed.map((p) => p.entryData);
    }

    const data = populatedDataList.map((resolvedData, index) => {
      const sanitizedData = filterUnauthorizedReadFields(resolvedData, schema, undefined);
      const entry = this.toPublicEntry(processed[index].e, sanitizedData);
      return projectFields(entry, query.fields);
    });

    const last = entries[entries.length - 1];
    const result: PaginatedResult<any> = cursor
      ? {
          data,
          meta: { limit, nextCursor: hasMore && last ? encodeCursor(sortField, sortDir, last) : null },
        }
      : {
          data,
          meta: {
            total, page, limit,
            totalPages: Math.ceil(total / limit),
            ...(searchMode
              ? { searchMode }
              : { nextCursor: skip + entries.length < total && last ? encodeCursor(sortField, sortDir, last) : null }),
          },
        };
    // Only cache un-projected, un-populated responses (matches the read guard above)
    if (cacheable) {
      await this.cache.set(cacheKey, result, LIST_TTL);
    }
    return result;
  }

  async findOne(typeName: string, slug: string, query: PublicSingleQuery = {}): Promise<any> {
    const contentType = await this.resolveContentType(typeName, 'read');
    const locale = query.locale ?? 'en';

    // ── Cache lookup ──────────────────────────────────────────────────────────
    // populate/fields responses vary per request and are never written to cache,
    // so they must also SKIP the cache read — otherwise a populated request would
    // return a previously-cached raw (un-populated) entry under the same key.
    const cacheable = (!query.fields || query.fields.length === 0) && (!query.populate || query.populate.length === 0);
    const state = await this.cacheState(contentType.id);
    const cacheKey = `${state.prefix}slug:${slug}:${locale}:${query.stage || 'published'}`;
    if (cacheable) {
      const cached = await this.cache.get<any>(cacheKey);
      if (cached) return cached;
    }

    const db = this.readClient(state);

    const entry = await db.entry.findUnique({
      where: {
        contentTypeId_slug_locale: { contentTypeId: contentType.id, slug, locale },
      },
      select: {
        id: true, publicId: true, slug: true, locale: true,
        status: true, deletedAt: true, data: true, seo: true,
        createdAt: true, updatedAt: true,
      },
    });

    const allowedStatuses = query.stage === 'staging'
      ? ['staging', 'published']
      : query.stage === 'draft'
        ? ['draft', 'pending_review', 'staging', 'published']
        : query.stage === 'all'
          ? ['draft', 'pending_review', 'staging', 'published', 'archived']
          : ['published'];

    if (!entry || !allowedStatuses.includes(entry.status) || entry.deletedAt !== null) {
      throw new NotFoundException(
        `Entry with slug "${slug}" not found in "${typeName}" (locale: ${locale})`,
      );
    }

    let data = normalizeDataKeys(entry.data as Record<string, any>);
    if (needsRepeaterIds(data)) {
      data = injectRepeaterIds(data);
    }

    const schema = contentType.schema as unknown as FieldDef[];
    if (query.populate?.length) {
      data = await populateDeep(data, schema, query.populate, db);
    }

    data = filterUnauthorizedReadFields(data, schema, undefined);

    const result = projectFields(this.toPublicEntry(entry, data), query.fields);
    // Only cache un-projected, un-populated responses (matches the read guard above)
    if (cacheable) {
      await this.cache.set(cacheKey, result, ENTRY_TTL);
    }
    return result;
  }

  async create(typeName: string, slug: string, data: Record<string, any>, locale = 'en') {
    const contentType = await this.resolveContentType(typeName, 'create');
    const schema = contentType.schema as unknown as FieldDef[];
    validateFieldWritePermissions(data, undefined, schema, undefined);

    const existing = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug_locale: { contentTypeId: contentType.id, slug, locale } },
    });
    if (existing) {
      throw new ConflictException(`Slug "${slug}" already exists in "${typeName}" (locale: ${locale})`);
    }

    const created = await this.prisma.entry.create({
      data: {
        slug,
        locale,
        status: 'published',
        data: normalizeDataKeys(
          sanitizeEntryData(injectRepeaterIds(data), schema),
        ) as Prisma.InputJsonValue,
        contentTypeId: contentType.id,
      },
      select: {
        id: true, publicId: true, slug: true, locale: true,
        status: true, deletedAt: true, data: true, seo: true,
        createdAt: true, updatedAt: true,
      },
    });


    // Same side effects as an admin-panel create, so webhooks (e.g. site
    // rebuilds), live admin views and plugins see API-key writes too.
    const event = { id: created.id, slug: created.slug, status: created.status, contentType: contentType.name };
    this.webhooks.fire('entry.created', event);
    this.realtime.notifyEntryCreated({ id: created.id, slug: created.slug, contentType: contentType.name, locale: created.locale });
    await this.hookBus?.emit(PluginEvents.ENTRY_AFTER_CREATE, { ...event, data: created.data as Record<string, any> });

    return this.toPublicEntry(created, filterUnauthorizedReadFields(created.data as Record<string, any>, schema, undefined));
  }

  async update(typeName: string, slug: string, data: Record<string, any>, locale = 'en') {
    const contentType = await this.resolveContentType(typeName, 'update');
    const schema = contentType.schema as unknown as FieldDef[];

    const entry = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug_locale: { contentTypeId: contentType.id, slug, locale } },
    });
    if (!entry || entry.deletedAt !== null) {
      throw new NotFoundException(`Entry with slug "${slug}" not found in "${typeName}" (locale: ${locale})`);
    }

    validateFieldWritePermissions(data, entry.data as Record<string, any>, schema, undefined);

    const updated = await this.prisma.entry.update({
      where: { id: entry.id },
      data: {
        data: normalizeDataKeys(
          sanitizeEntryData(injectRepeaterIds(data), schema),
        ) as Prisma.InputJsonValue,
      },
      select: {
        id: true, publicId: true, slug: true, locale: true,
        status: true, deletedAt: true, data: true, seo: true,
        createdAt: true, updatedAt: true,
      },
    });


    const event = { id: updated.id, slug: updated.slug, status: updated.status, contentType: contentType.name };
    this.webhooks.fire('entry.updated', event);
    this.realtime.notifyEntryUpdated({ ...event, locale: updated.locale });
    await this.hookBus?.emit(PluginEvents.ENTRY_AFTER_UPDATE, { ...event, data: updated.data as Record<string, any> });

    return this.toPublicEntry(updated, filterUnauthorizedReadFields(updated.data as Record<string, any>, schema, undefined));
  }

  async remove(typeName: string, slug: string, locale = 'en') {
    const contentType = await this.resolveContentType(typeName, 'delete');

    const entry = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug_locale: { contentTypeId: contentType.id, slug, locale } },
    });
    if (!entry || entry.deletedAt !== null) {
      throw new NotFoundException(`Entry with slug "${slug}" not found in "${typeName}" (locale: ${locale})`);
    }

    await this.hookBus?.emit(PluginEvents.ENTRY_BEFORE_DELETE, { id: entry.id, entry });
    await this.prisma.entry.update({ where: { id: entry.id }, data: { deletedAt: new Date() } });

    this.webhooks.fire('entry.deleted', { id: entry.id, slug: entry.slug });
    this.realtime.notifyEntryDeleted({ id: entry.id, slug: entry.slug, contentType: contentType.name });
    await this.hookBus?.emit(PluginEvents.ENTRY_AFTER_DELETE, { id: entry.id, slug: entry.slug, contentType: contentType.name });

    return { message: `Entry "${slug}" deleted from "${typeName}"` };
  }

  /**
   * Return a draft/archived entry when the caller presents a valid signed preview token.
   * The token must have been generated by POST /api/entries/:id/preview-url and encodes
   * the entry's internal id + publicId. No status or deletedAt filtering — editors can
   * preview any non-purged entry through this endpoint.
   */
  async findOnePreview(typeName: string, slug: string, token: string, locale = 'en'): Promise<any> {
    // Validate the token first — reject bad/expired tokens before touching the DB
    let payload: { sub: string; entryId: number; publicId: string };
    try {
      payload = this.jwtService.verify(token) as typeof payload;
    } catch {
      throw new UnauthorizedException('Preview token is invalid or has expired');
    }

    if (payload.sub !== 'preview') {
      throw new UnauthorizedException('Invalid preview token');
    }

    const name = typeName.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const contentType = await this.prisma.contentType.findUnique({ where: { name } });
    if (!contentType) {
      throw new NotFoundException(`Content type "${name}" does not exist`);
    }

    // Fetch by id from token — ensures the token is scoped to the right entry
    const entry = await this.prisma.entry.findUnique({
      where: { id: payload.entryId },
      select: {
        id: true, publicId: true, slug: true, locale: true,
        status: true, deletedAt: true, data: true, seo: true,
        createdAt: true, updatedAt: true, contentTypeId: true,
      },
    });

    if (!entry || entry.deletedAt !== null || entry.contentTypeId !== contentType.id) {
      throw new NotFoundException(`Entry not found for preview`);
    }

    if (entry.slug !== slug || entry.locale !== (locale ?? 'en')) {
      throw new NotFoundException(`Entry slug or locale mismatch`);
    }

    let data = normalizeDataKeys(entry.data as Record<string, any>);
    if (needsRepeaterIds(data)) {
      data = injectRepeaterIds(data);
    }

    return { ...this.toPublicEntry(entry, data), _preview: true, status: entry.status };
  }
}
