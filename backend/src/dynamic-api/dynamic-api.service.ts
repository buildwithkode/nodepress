import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeDataKeys, injectRepeaterIds, needsRepeaterIds } from '../common/normalize';
import { sanitizeEntryData } from '../common/sanitize';
import { FieldDef } from '../fields/field.types';

type MethodKey = 'list' | 'read' | 'create' | 'update' | 'delete';

type SortDirection = 'asc' | 'desc';
type SortableField = 'createdAt' | 'updatedAt' | 'slug';

export interface PublicListQuery {
  page?: number;
  limit?: number;
  sort?: string;                    // e.g. "createdAt:desc" or "slug:asc"
  filter?: Record<string, string>;  // e.g. { category: "tech", author: "john" }
  search?: string;                  // full-text search on slug + data
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const SORTABLE: Record<string, SortableField> = {
  createdAt: 'createdAt',
  updatedat: 'updatedAt',
  updatedAt: 'updatedAt',
  slug: 'slug',
};

/** Parse "field:direction" → Prisma orderBy object */
function parseSortParam(sort?: string): Record<string, SortDirection> {
  if (!sort) return { createdAt: 'desc' };
  const [rawField, rawDir] = sort.split(':');
  const field = SORTABLE[rawField] ?? 'createdAt';
  const direction: SortDirection = rawDir === 'asc' ? 'asc' : 'desc';
  return { [field]: direction };
}

/** Build Prisma JSON-path where clauses from filter object */
function buildDataFilters(filter: Record<string, string>) {
  // Each filter becomes a path match on the JSON data column.
  // Uses Prisma's AND array so all filters must match (AND semantics).
  return Object.entries(filter).map(([key, value]) => ({
    data: {
      path: [key],
      string_contains: value,
    },
  }));
}

@Injectable()
export class DynamicApiService {
  constructor(private prisma: PrismaService) {}

  private async resolveContentType(typeName: string, method: MethodKey) {
    const name = typeName.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const contentType = await this.prisma.contentType.findUnique({ where: { name } });

    if (!contentType) {
      throw new NotFoundException(`Content type "${name}" does not exist`);
    }

    const allowed = contentType.allowedMethods as string[] | null;
    if (allowed !== null && !allowed.includes(method)) {
      throw new NotFoundException(`Content type "${name}" does not exist`);
    }

    return contentType;
  }

  /** Map internal entry row → public-facing shape (UUID as id, no deletedAt) */
  private async toPublicEntry(e: any, data: Record<string, any>) {
    const { id: _internal, publicId, deletedAt: _del, status: _st, ...rest } = e;
    return { id: publicId, ...rest, data };
  }

  async findAll(typeName: string, query: PublicListQuery = {}): Promise<PaginatedResult<any>> {
    const contentType = await this.resolveContentType(typeName, 'list');

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;
    const orderBy = parseSortParam(query.sort);

    // Build where: only published + non-deleted entries visible publicly
    const dataFilters = query.filter ? buildDataFilters(query.filter) : [];
    const where: any = {
      contentTypeId: contentType.id,
      status: 'published',
      deletedAt: null,
      ...(dataFilters.length > 0 ? { AND: dataFilters } : {}),
    };

    // Full-text search across slug + JSON data
    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      const matches = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM entries
        WHERE "contentTypeId" = ${contentType.id}
          AND status = 'published'
          AND "deletedAt" IS NULL
          AND (LOWER(slug) LIKE LOWER(${term}) OR LOWER(data::text) LIKE LOWER(${term}))
      `;
      where.id = { in: matches.map((m) => m.id) };
    }

    const [total, entries] = await Promise.all([
      this.prisma.entry.count({ where }),
      this.prisma.entry.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: { id: true, publicId: true, slug: true, status: true, deletedAt: true, data: true, createdAt: true, updatedAt: true },
      }),
    ]);

    const data = await Promise.all(
      entries.map(async (e) => {
        let entryData = normalizeDataKeys(e.data as Record<string, any>);
        if (needsRepeaterIds(entryData)) {
          entryData = injectRepeaterIds(entryData);
          await this.prisma.entry.update({ where: { id: e.id }, data: { data: entryData as any } });
        }
        return this.toPublicEntry(e, entryData);
      }),
    );

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(typeName: string, slug: string) {
    const contentType = await this.resolveContentType(typeName, 'read');

    const entry = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug: { contentTypeId: contentType.id, slug } },
      select: { id: true, publicId: true, slug: true, status: true, deletedAt: true, data: true, createdAt: true, updatedAt: true },
    });

    if (!entry || entry.status !== 'published' || entry.deletedAt !== null) {
      throw new NotFoundException(`Entry with slug "${slug}" not found in "${typeName}"`);
    }

    let data = normalizeDataKeys(entry.data as Record<string, any>);
    if (needsRepeaterIds(data)) {
      data = injectRepeaterIds(data);
      await this.prisma.entry.update({ where: { id: entry.id }, data: { data: data as any } });
    }

    return this.toPublicEntry(entry, data);
  }

  async create(typeName: string, slug: string, data: Record<string, any>) {
    const contentType = await this.resolveContentType(typeName, 'create');

    const existing = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug: { contentTypeId: contentType.id, slug } },
    });
    if (existing) throw new ConflictException(`Slug "${slug}" already exists in "${typeName}"`);

    const created = await this.prisma.entry.create({
      data: {
        slug,
        status: 'published',
        data: normalizeDataKeys(
          sanitizeEntryData(injectRepeaterIds(data), contentType.schema as unknown as FieldDef[]),
        ) as any,
        contentTypeId: contentType.id,
      },
      select: { id: true, publicId: true, slug: true, status: true, deletedAt: true, data: true, createdAt: true, updatedAt: true },
    });

    return this.toPublicEntry(created, created.data as Record<string, any>);
  }

  async update(typeName: string, slug: string, data: Record<string, any>) {
    const contentType = await this.resolveContentType(typeName, 'update');

    const entry = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug: { contentTypeId: contentType.id, slug } },
    });
    if (!entry || entry.deletedAt !== null) {
      throw new NotFoundException(`Entry with slug "${slug}" not found in "${typeName}"`);
    }

    const updated = await this.prisma.entry.update({
      where: { id: entry.id },
      data: {
        data: normalizeDataKeys(
          sanitizeEntryData(injectRepeaterIds(data), contentType.schema as unknown as FieldDef[]),
        ) as any,
      },
      select: { id: true, publicId: true, slug: true, status: true, deletedAt: true, data: true, createdAt: true, updatedAt: true },
    });

    return this.toPublicEntry(updated, updated.data as Record<string, any>);
  }

  async remove(typeName: string, slug: string) {
    const contentType = await this.resolveContentType(typeName, 'delete');

    const entry = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug: { contentTypeId: contentType.id, slug } },
    });
    if (!entry || entry.deletedAt !== null) {
      throw new NotFoundException(`Entry with slug "${slug}" not found in "${typeName}"`);
    }

    // Soft delete via public API too — protect data integrity
    await this.prisma.entry.update({ where: { id: entry.id }, data: { deletedAt: new Date() } });
    return { message: `Entry "${slug}" deleted from "${typeName}"` };
  }
}
