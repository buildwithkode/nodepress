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
import { populateDeep } from '../common/populate.util';

type MethodKey = 'list' | 'read' | 'create' | 'update' | 'delete';

type SortDirection = 'asc' | 'desc';
type SortableField = 'createdAt' | 'updatedAt' | 'slug';

export interface PublicListQuery {
  page?: number;
  limit?: number;
  sort?: string;                    // e.g. "createdAt:desc" or "slug:asc"
  filter?: Record<string, string>;  // e.g. { category: "tech", author: "john" }
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
    const cacheKey = `${cachePrefix(typeName)}list:${JSON.stringify({ page, limit, sort: query.sort, search: query.search, filter: query.filter, locale: query.locale })}`;
    const cached = await this.cache.get<PaginatedResult<any>>(cacheKey);
    if (cached) return cached;

    // Build where: only published + non-deleted entries visible publicly
    const dataFilters = query.filter ? buildDataFilters(query.filter) : [];
    const where: any = {
      contentTypeId: contentType.id,
      status: 'published',
      deletedAt: null,
      ...(query.locale ? { locale: query.locale } : {}),
      ...(dataFilters.length > 0 ? { AND: dataFilters } : {}),
    };

    // ── Full-text search ──────────────────────────────────────────────────────
    // Uses the entries_fts_idx GIN index for performance.
    // Falls back to LIKE for short/special-char queries tsquery rejects.
    // Adds searchMode to meta so clients know which path was taken.
    let searchMode: 'fulltext' | 'fallback' | undefined;

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      let matches: { id: number }[];
      try {
        matches = await this.prisma.$queryRaw<{ id: number }[]>`
          SELECT id FROM entries
          WHERE "contentTypeId" = ${contentType.id}
            AND status = 'published'
            AND "deletedAt" IS NULL
            AND to_tsvector('english', slug || ' ' || data::text) @@ websearch_to_tsquery('english', ${term})
        `;
        searchMode = 'fulltext';
      } catch {
        // Fallback: plain LIKE for short/special-char queries that tsquery can't parse
        const like = `%${term}%`;
        matches = await this.prisma.$queryRaw<{ id: number }[]>`
          SELECT id FROM entries
          WHERE "contentTypeId" = ${contentType.id}
            AND status = 'published'
            AND "deletedAt" IS NULL
            AND (LOWER(slug) LIKE LOWER(${like}) OR LOWER(data::text) LIKE LOWER(${like}))
        `;
        searchMode = 'fallback';
      }
      // Use [-1] sentinel so Prisma returns 0 rows rather than ignoring the clause
      where.id = { in: matches.length > 0 ? matches.map((m) => m.id) : [-1] };
    }

    const [total, entries] = await Promise.all([
      this.prisma.entry.count({ where }),
      this.prisma.entry.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true, publicId: true, slug: true, locale: true,
          status: true, deletedAt: true, data: true,
          createdAt: true, updatedAt: true,
        },
      }),
    ]);

    // Process repeater IDs in memory; batch DB updates in one transaction
    const processed = entries.map((e) => {
      let entryData = normalizeDataKeys(e.data as Record<string, any>);
      if (needsRepeaterIds(entryData)) {
        entryData = injectRepeaterIds(entryData);
        return { e, entryData, needsUpdate: true };
      }
      return { e, entryData, needsUpdate: false };
    });

    const toUpdate = processed.filter((p) => p.needsUpdate);
    if (toUpdate.length > 0) {
      await this.prisma.$transaction(
        toUpdate.map((p) =>
          this.prisma.entry.update({
            where: { id: p.e.id },
            data: { data: p.entryData as Prisma.InputJsonValue },
          }),
        ),
      );
    }

    const schema = contentType.schema as unknown as FieldDef[];
    const populated = await Promise.all(
      processed.map(async ({ e, entryData }) => {
        const resolvedData = query.populate?.length
          ? await populateDeep(entryData, schema, query.populate, this.prisma)
          : entryData;
        return this.toPublicEntry(e, resolvedData);
      }),
    );
    const data = populated.map((entry) => projectFields(entry, query.fields));

    const result: PaginatedResult<any> = {
      data,
      meta: {
        total, page, limit,
        totalPages: Math.ceil(total / limit),
        ...(searchMode ? { searchMode } : {}),
      },
    };
    // Only cache un-projected responses (fields param varies per caller)
    if (!query.fields || query.fields.length === 0) {
      await this.cache.set(cacheKey, result, LIST_TTL);
    }
    return result;
  }

  async findOne(typeName: string, slug: string, query: PublicSingleQuery = {}): Promise<any> {
    const contentType = await this.resolveContentType(typeName, 'read');
    const locale = query.locale ?? 'en';

    // ── Cache lookup ──────────────────────────────────────────────────────────
    const cacheKey = `${cachePrefix(typeName)}slug:${slug}:${locale}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const entry = await this.prisma.entry.findUnique({
      where: {
        contentTypeId_slug_locale: { contentTypeId: contentType.id, slug, locale },
      },
      select: {
        id: true, publicId: true, slug: true, locale: true,
        status: true, deletedAt: true, data: true,
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
      await this.prisma.entry.update({
        where: { id: entry.id },
        data: { data: data as Prisma.InputJsonValue },
      });
    }

    if (query.populate?.length) {
      const schema = contentType.schema as unknown as FieldDef[];
      data = await populateDeep(data, schema, query.populate, this.prisma);
    }

    const result = projectFields(this.toPublicEntry(entry, data), query.fields);
    // Only cache un-projected, un-populated responses
    if ((!query.fields || query.fields.length === 0) && (!query.populate || query.populate.length === 0)) {
      await this.cache.set(cacheKey, result, ENTRY_TTL);
    }
    return result;
  }

  async create(typeName: string, slug: string, data: Record<string, any>, locale = 'en') {
    const contentType = await this.resolveContentType(typeName, 'create');

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
          sanitizeEntryData(injectRepeaterIds(data), contentType.schema as unknown as FieldDef[]),
        ) as Prisma.InputJsonValue,
        contentTypeId: contentType.id,
      },
      select: {
        id: true, publicId: true, slug: true, locale: true,
        status: true, deletedAt: true, data: true,
        createdAt: true, updatedAt: true,
      },
    });

    await this.invalidate(typeName);
    return this.toPublicEntry(created, created.data as Record<string, any>);
  }

  async update(typeName: string, slug: string, data: Record<string, any>, locale = 'en') {
    const contentType = await this.resolveContentType(typeName, 'update');

    const entry = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug_locale: { contentTypeId: contentType.id, slug, locale } },
    });
    if (!entry || entry.deletedAt !== null) {
      throw new NotFoundException(`Entry with slug "${slug}" not found in "${typeName}" (locale: ${locale})`);
    }

    const updated = await this.prisma.entry.update({
      where: { id: entry.id },
      data: {
        data: normalizeDataKeys(
          sanitizeEntryData(injectRepeaterIds(data), contentType.schema as unknown as FieldDef[]),
        ) as Prisma.InputJsonValue,
      },
      select: {
        id: true, publicId: true, slug: true, locale: true,
        status: true, deletedAt: true, data: true,
        createdAt: true, updatedAt: true,
      },
    });

    await this.invalidate(typeName);
    return this.toPublicEntry(updated, updated.data as Record<string, any>);
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
        status: true, deletedAt: true, data: true,
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
