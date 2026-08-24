import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';
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
  sort?: string;                    // e.g. "createdAt:desc" or "slug:asc"
  filter?: Record<string, string>;  // legacy simple filter e.g. { category: "tech" }
  where?: Record<string, any>;      // advanced where query e.g. { price: { gte: 100 }, category: { in: ["tech", "news"] } }
  search?: string;                  // full-text search on slug + data
  locale?: string;                  // filter by locale (e.g. "en", "fr")
  populate?: string[];              // relation field names to inline-populate
  fields?: string[];                // field projection — only return listed data keys
}

export interface PublicSingleQuery {
  locale?: string;   // default: "en"
  populate?: string[];
  fields?: string[];                // field projection — only return listed data keys
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
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

/** Prefix used for cache invalidation — flushes ALL variants for a content type */
const cachePrefix    = (typeName: string) => `dyn:${typeName}:`;
const ctCacheKey     = (typeName: string) => `ct:meta:${typeName}`;

/** Parse "field:direction" → Prisma orderBy object */
function parseSortParam(sort?: string): Record<string, SortDirection> {
  if (!sort) return { createdAt: 'desc' };
  const [rawField, rawDir] = sort.split(':');
  const field = SORTABLE[rawField] ?? 'createdAt';
  const direction: SortDirection = rawDir === 'asc' ? 'asc' : 'desc';
  return { [field]: direction };
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
export class DynamicApiService {
  constructor(
    private prisma: PrismaService,
    private cache: AppCacheService,
    private jwtService: JwtService,
  ) {}

  private async resolveContentType(typeName: string, method: MethodKey) {
    const name = typeName.trim().toLowerCase().replace(/[\s-]+/g, '_');

    // Cache content type meta for 5 minutes — avoids a DB round-trip on every
    // public API request. Invalidated by invalidate() on any mutation.
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

  /** Flush all cached results for a content type (called on any mutation) */
  private async invalidate(typeName: string) {
    await Promise.all([
      this.cache.invalidatePrefix(cachePrefix(typeName)),
      this.cache.invalidatePrefix(ctCacheKey(typeName)),
    ]);
  }

  async findAll(typeName: string, query: PublicListQuery = {}): Promise<PaginatedResult<any>> {
    const contentType = await this.resolveContentType(typeName, 'list');

    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip  = (page - 1) * limit;
    const orderBy = parseSortParam(query.sort);

    // ── Cache lookup ──────────────────────────────────────────────────────────
    // populate/fields responses vary per request and aren't cached, so they must
    // also skip the cache read (the key omits populate/fields) — otherwise a
    // populated list could be served raw, or vice versa.
    const cacheable = (!query.fields || query.fields.length === 0) && (!query.populate || query.populate.length === 0);
    const cacheKey = `${cachePrefix(typeName)}list:${JSON.stringify({ page, limit, sort: query.sort, search: query.search, filter: query.filter, where: query.where, locale: query.locale })}`;
    if (cacheable) {
      const cached = await this.cache.get<PaginatedResult<any>>(cacheKey);
      if (cached) return cached;
    }

    // Build where: only published + non-deleted entries visible publicly
    const advancedWhere = buildAdvancedWhere(query.where, query.filter);
    const where: any = {
      contentTypeId: contentType.id,
      status: 'published',
      deletedAt: null,
      ...(query.locale ? { locale: query.locale } : {}),
      ...(advancedWhere.length > 0 ? { AND: advancedWhere } : {}),
    };

    // ── Full-text search ──────────────────────────────────────────────────────
    // Uses the entries_fts_idx GIN index with DB-level pagination (LIMIT/OFFSET)
    // to prevent memory exhaustion and Postgres parameter overflow on large datasets.
    // Falls back to LIKE for short/special-char queries tsquery rejects.
    let searchMode: 'fulltext' | 'fallback' | undefined;
    let total = 0;
    let entries: any[] = [];

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      let matches: { id: number }[] = [];
      try {
        const countResult = await this.prisma.$queryRaw<any[]>`
          SELECT count(*)::int AS count FROM entries
          WHERE "contentTypeId" = ${contentType.id}
            AND status = 'published'
            AND "deletedAt" IS NULL
            ${query.locale ? Prisma.sql`AND locale = ${query.locale}` : Prisma.empty}
            AND to_tsvector('english', slug || ' ' || COALESCE(data::text, '')) @@ websearch_to_tsquery('english', ${term})
        `;
        total = countResult[0]?.count != null ? Number(countResult[0].count) : countResult.length;

        if (total > 0) {
          const res = await this.prisma.$queryRaw<{ id: number }[]>`
            SELECT id FROM entries
            WHERE "contentTypeId" = ${contentType.id}
              AND status = 'published'
              AND "deletedAt" IS NULL
              ${query.locale ? Prisma.sql`AND locale = ${query.locale}` : Prisma.empty}
              AND to_tsvector('english', slug || ' ' || COALESCE(data::text, '')) @@ websearch_to_tsquery('english', ${term})
            ORDER BY "createdAt" DESC
            LIMIT ${limit} OFFSET ${skip}
          `;
          matches = Array.isArray(res) ? res : (countResult[0]?.id != null ? countResult : []);
        }
        searchMode = 'fulltext';
      } catch {
        // Fallback: plain LIKE for short/special-char queries that tsquery can't parse
        const like = `%${term}%`;
        const countResult = await this.prisma.$queryRaw<any[]>`
          SELECT count(*)::int AS count FROM entries
          WHERE "contentTypeId" = ${contentType.id}
            AND status = 'published'
            AND "deletedAt" IS NULL
            ${query.locale ? Prisma.sql`AND locale = ${query.locale}` : Prisma.empty}
            AND (LOWER(slug) LIKE LOWER(${like}) OR LOWER(COALESCE(data::text, '')) LIKE LOWER(${like}))
        `;
        total = countResult[0]?.count != null ? Number(countResult[0].count) : countResult.length;

        if (total > 0) {
          const res = await this.prisma.$queryRaw<{ id: number }[]>`
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
        const rawEntries = await this.prisma.entry.findMany({
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
    } else {
      const [countedTotal, fetchedEntries] = await Promise.all([
        this.prisma.entry.count({ where }),
        this.prisma.entry.findMany({
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
      populatedDataList = await populateManyDeep(dataList, schema, query.populate, this.prisma);
    } else {
      populatedDataList = processed.map((p) => p.entryData);
    }

    const data = populatedDataList.map((resolvedData, index) => {
      const sanitizedData = filterUnauthorizedReadFields(resolvedData, schema, undefined);
      const entry = this.toPublicEntry(processed[index].e, sanitizedData);
      return projectFields(entry, query.fields);
    });

    const result: PaginatedResult<any> = {
      data,
      meta: {
        total, page, limit,
        totalPages: Math.ceil(total / limit),
        ...(searchMode ? { searchMode } : {}),
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
    const cacheKey = `${cachePrefix(typeName)}slug:${slug}:${locale}`;
    if (cacheable) {
      const cached = await this.cache.get<any>(cacheKey);
      if (cached) return cached;
    }

    const entry = await this.prisma.entry.findUnique({
      where: {
        contentTypeId_slug_locale: { contentTypeId: contentType.id, slug, locale },
      },
      select: {
        id: true, publicId: true, slug: true, locale: true,
        status: true, deletedAt: true, data: true, seo: true,
        createdAt: true, updatedAt: true,
      },
    });

    if (!entry || entry.status !== 'published' || entry.deletedAt !== null) {
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
      data = await populateDeep(data, schema, query.populate, this.prisma);
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

    await this.invalidate(typeName);
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

    await this.invalidate(typeName);
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

    await this.prisma.entry.update({ where: { id: entry.id }, data: { deletedAt: new Date() } });
    await this.invalidate(typeName);
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
