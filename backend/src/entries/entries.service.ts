import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { DataValidator } from '../fields/data.validator';
import { FieldDef } from '../fields/field.types';
import { normalizeDataKeys, injectRepeaterIds, needsRepeaterIds } from '../common/normalize';
import { sanitizeEntryData } from '../common/sanitize';
import { populateDeep } from '../common/populate.util';
import { filterUnauthorizedReadFields, validateFieldWritePermissions } from '../common/field-security.util';
import { entriesToCsv, parseCsvToEntries } from '../common/csv.util';
import { PluginHookBus } from '../plugin/plugin-hook-bus';
import { PluginEvents } from '../plugin/plugin.events';

export interface AdminListQuery {
  contentTypeId?: number;
  status?: string;          // filter by status (draft | published | archived)
  deleted?: boolean;        // true = show only soft-deleted entries
  search?: string;          // full-text search on slug + data
  locale?: string;          // filter by locale (e.g. 'en', 'fr')
  page?: number;
  limit?: number;
  role?: string;            // requesting user role for field-level security
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

@Injectable()
export class EntriesService {
  constructor(
    private prisma: PrismaService,
    private dataValidator: DataValidator,
    private webhooks: WebhooksService,
    private realtime: RealtimeGateway,
    private jwtService: JwtService,
    @Optional() private hookBus?: PluginHookBus,
  ) {}

  async create(dto: CreateEntryDto, actorId?: number, role?: string) {
    const contentType = await this.prisma.contentType.findUnique({
      where: { id: dto.contentTypeId },
    });

    if (!contentType) {
      throw new BadRequestException(`Content type #${dto.contentTypeId} not found`);
    }

    if (this.hookBus) {
      await this.hookBus.emit(PluginEvents.ENTRY_BEFORE_CREATE, {
        dto,
        actorId,
        role,
        contentType: contentType.name,
      });
    }

    const schema = contentType.schema as unknown as FieldDef[];
    validateFieldWritePermissions(dto.data as Record<string, any>, undefined, schema, role);

    this.dataValidator.validate(
      dto.data as Record<string, unknown>,
      schema,
    );

    const locale = dto.locale ?? 'en';
    const existing = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug_locale: { contentTypeId: dto.contentTypeId, slug: dto.slug, locale } },
    });

    if (existing) {
      throw new ConflictException(`Slug "${dto.slug}" already exists for locale "${locale}" in this content type`);
    }

    const entry = await this.prisma.entry.create({
      data: {
        slug: dto.slug,
        locale,
        status: dto.status ?? 'published',
        data: normalizeDataKeys(
          sanitizeEntryData(
            injectRepeaterIds(dto.data as Record<string, any>),
            schema,
          ),
        ),
        contentTypeId: dto.contentTypeId,
        seo: dto.seo ? { ...dto.seo } : null,
        publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
      },
      include: { contentType: true },
    });

    this.webhooks.fire('entry.created', {
      id: entry.id,
      slug: entry.slug,
      status: entry.status,
      contentType: contentType.name,
    });

    this.realtime.notifyEntryCreated({
      id: entry.id,
      slug: entry.slug,
      contentType: contentType.name,
      locale: entry.locale,
    });

    if (this.hookBus) {
      await this.hookBus.emit(PluginEvents.ENTRY_AFTER_CREATE, {
        id: entry.id,
        slug: entry.slug,
        status: entry.status,
        contentType: contentType.name,
        data: entry.data as Record<string, any>,
      });
    }

    return entry;
  }

  async findAll(query: AdminListQuery = {}): Promise<PaginatedResult<any>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.EntryWhereInput = {
      deletedAt: query.deleted ? { not: null } : null,
    };

    if (query.contentTypeId) where.contentTypeId = query.contentTypeId;
    if (query.status) where.status = query.status;
    if (query.locale) where.locale = query.locale;

    let entries: any[] = [];
    let total = 0;

    if (query.search?.trim()) {
      const term = query.search.trim();

      // Escape special LIKE pattern characters (% and _)
      const escapedTerm = term.replace(/[%_]/g, '\\$&');
      const like = `%${escapedTerm}%`;

      // Build extra WHERE conditions for contentTypeId, status, locale, deletedAt
      const whereConditions: Prisma.Sql[] = [];
      if (query.contentTypeId) {
        whereConditions.push(Prisma.sql`AND "contentTypeId" = ${query.contentTypeId}`);
      }
      if (query.status) {
        whereConditions.push(Prisma.sql`AND status = ${query.status}`);
      }
      if (query.locale) {
        whereConditions.push(Prisma.sql`AND locale = ${query.locale}`);
      }
      if (query.deleted) {
        whereConditions.push(Prisma.sql`AND "deletedAt" IS NOT NULL`);
      } else {
        whereConditions.push(Prisma.sql`AND "deletedAt" IS NULL`);
      }

      // Try PostgreSQL full-text search with plainto_tsquery
      try {
        const countResult = await this.prisma.$queryRaw<{ count: number }[]>`
          SELECT count(*)::int as count
          FROM entries
          WHERE to_tsvector('english', slug || ' ' || COALESCE(data::text, '')) @@ plainto_tsquery('english', ${term})
            ${Prisma.join(whereConditions, ' ')}
        `;
        total = countResult[0]?.count != null ? Number(countResult[0].count) : 0;

        if (total > 0) {
          const res = await this.prisma.$queryRaw<{ id: number }[]>`
            SELECT id
            FROM entries
            WHERE to_tsvector('english', slug || ' ' || COALESCE(data::text, '')) @@ plainto_tsquery('english', ${term})
              ${Prisma.join(whereConditions, ' ')}
            ORDER BY "createdAt" DESC
            LIMIT ${limit} OFFSET ${skip}
          `;
          const pageMatches = Array.isArray(res) ? res : (countResult[0]?.count != null ? countResult : []);
          const pageIds = pageMatches.map((m) => m.id);
          if (pageIds.length > 0) {
            const rawEntries = await this.prisma.entry.findMany({
              where: { id: { in: pageIds } },
              include: { contentType: true },
            });
            const entryMap = new Map(rawEntries.map((e) => [e.id, e]));
            entries = pageIds.map((id) => entryMap.get(id)).filter(Boolean);
          } else {
            entries = [];
          }
        } else {
          entries = [];
        }
      } catch {
        // Fallback: ILIKE search with pushed limit and count query
        const countResult = await this.prisma.$queryRaw<{ count: number }[]>`
          SELECT count(*)::int as count
          FROM entries
          WHERE (LOWER(slug) LIKE LOWER(${like}) OR LOWER(COALESCE(data::text, '')) LIKE LOWER(${like}))
            ${Prisma.join(whereConditions, ' ')}
        `;
        total = countResult[0]?.count != null ? Number(countResult[0].count) : countResult.length;

        if (total > 0) {
          const res = await this.prisma.$queryRaw<{ id: number }[]>`
            SELECT id
            FROM entries
            WHERE (LOWER(slug) LIKE LOWER(${like}) OR LOWER(COALESCE(data::text, '')) LIKE LOWER(${like}))
              ${Prisma.join(whereConditions, ' ')}
            ORDER BY "createdAt" DESC
            LIMIT ${limit} OFFSET ${skip}
          `;
          const pageMatches = Array.isArray(res) ? res : (countResult[0]?.count != null ? countResult : []);
          const pageIds = pageMatches.map((m) => m.id);
          if (pageIds.length > 0) {
            const rawEntries = await this.prisma.entry.findMany({
              where: { id: { in: pageIds } },
              include: { contentType: true },
            });
            const entryMap = new Map(rawEntries.map((e) => [e.id, e]));
            entries = pageIds.map((id) => entryMap.get(id)).filter(Boolean);
          } else {
            entries = [];
          }
        } else {
          entries = [];
        }
      }
    } else {
      const [countedTotal, fetchedEntries] = await Promise.all([
        this.prisma.entry.count({ where }),
        this.prisma.entry.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: { contentType: true },
        }),
      ]);
      total = countedTotal;
      entries = fetchedEntries;
    }

    // Process repeater IDs in-memory and filter read fields by role
    const data = entries.map((e) => {
      let entryData = e.data as Record<string, any>;
      if (needsRepeaterIds(entryData)) {
        entryData = injectRepeaterIds(entryData);
      }
      if (e.contentType?.schema) {
        entryData = filterUnauthorizedReadFields(
          entryData,
          e.contentType.schema as unknown as FieldDef[],
          query.role,
        );
      }
      return { ...e, data: entryData };
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number, populate: string[] = [], role?: string) {
    const entry = await this.prisma.entry.findUnique({
      where: { id },
      include: { contentType: true },
    });

    if (!entry || entry.deletedAt !== null) {
      throw new NotFoundException(`Entry #${id} not found`);
    }

    let data = entry.data as Record<string, any>;
    if (needsRepeaterIds(data)) {
      data = injectRepeaterIds(data);
    }

    if (populate.length && entry.contentType) {
      const schema = entry.contentType.schema as unknown as FieldDef[];
      data = await populateDeep(data, schema, populate, this.prisma);
    }

    if (entry.contentType?.schema) {
      data = filterUnauthorizedReadFields(
        data,
        entry.contentType.schema as unknown as FieldDef[],
        role,
      );
    }

    return { ...entry, data };
  }

  async update(id: number, dto: UpdateEntryDto, actorId?: number, role?: string) {
    const entry = await this.findOne(id);
    const schema = entry.contentType.schema as unknown as FieldDef[];

    if (this.hookBus) {
      await this.hookBus.emit(PluginEvents.ENTRY_BEFORE_UPDATE, {
        id,
        dto,
        actorId,
        role,
        currentEntry: entry,
      });

      if (dto.status === 'published' && entry.status !== 'published') {
        await this.hookBus.emit(PluginEvents.ENTRY_BEFORE_PUBLISH, { id, entry });
      }
    }

    if (dto.data !== undefined) {
      validateFieldWritePermissions(dto.data as Record<string, any>, entry.data as Record<string, any>, schema, role);
    }

    // Snapshot current state as a version before applying changes
    await this.prisma.entryVersion.create({
      data: {
        entryId: entry.id,
        slug: entry.slug,
        data: entry.data,
        status: entry.status,
        createdBy: actorId ?? null,
      },
    });

    const updateData: any = {};

    if (dto.slug !== undefined) {
      if (dto.slug !== entry.slug) {
        const conflict = await this.prisma.entry.findUnique({
          where: { contentTypeId_slug_locale: { contentTypeId: entry.contentTypeId, slug: dto.slug, locale: entry.locale } },
        });
        if (conflict) {
          throw new ConflictException(`Slug "${dto.slug}" already exists for locale "${entry.locale}" in this content type`);
        }
      }
      updateData.slug = dto.slug;
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }

    if (dto.data !== undefined) {
      this.dataValidator.validate(
        dto.data as Record<string, unknown>,
        entry.contentType.schema as unknown as FieldDef[],
        { partial: true },
      );
      updateData.data = normalizeDataKeys(
        sanitizeEntryData(
          injectRepeaterIds(dto.data as Record<string, any>),
          entry.contentType.schema as unknown as FieldDef[],
        ),
      );
    }

    if (dto.seo !== undefined) {
      updateData.seo = dto.seo;
    }

    if (dto.publishAt !== undefined) {
      updateData.publishAt = dto.publishAt ? new Date(dto.publishAt) : null;
    }

    const updated = await this.prisma.entry.update({
      where: { id },
      data: updateData,
      include: { contentType: true },
    });

    this.webhooks.fire('entry.updated', {
      id: updated.id,
      slug: updated.slug,
      status: updated.status,
      contentType: updated.contentType?.name,
    });

    this.realtime.notifyEntryUpdated({
      id: updated.id,
      slug: updated.slug,
      contentType: updated.contentType?.name ?? '',
      locale: updated.locale,
      status: updated.status,
    });

    if (this.hookBus) {
      await this.hookBus.emit(PluginEvents.ENTRY_AFTER_UPDATE, {
        id: updated.id,
        slug: updated.slug,
        status: updated.status,
        contentType: updated.contentType?.name,
        data: updated.data as Record<string, any>,
      });

      if (updated.status === 'published' && entry.status !== 'published') {
        await this.hookBus.emit(PluginEvents.ENTRY_AFTER_PUBLISH, {
          id: updated.id,
          slug: updated.slug,
          status: updated.status,
          contentType: updated.contentType?.name,
        });
      }
    }

    return updated;
  }

  /** Soft delete — sets deletedAt timestamp. */
  async remove(id: number) {
    const entry = await this.findOne(id);

    if (this.hookBus) {
      await this.hookBus.emit(PluginEvents.ENTRY_BEFORE_DELETE, { id, entry });
    }

    await this.prisma.entry.update({ where: { id }, data: { deletedAt: new Date() } });

    this.webhooks.fire('entry.deleted', { id: entry.id, slug: entry.slug });

    this.realtime.notifyEntryDeleted({
      id: entry.id,
      slug: entry.slug,
      contentType: (entry as { contentType?: { name: string } }).contentType?.name,
    });

    if (this.hookBus) {
      await this.hookBus.emit(PluginEvents.ENTRY_AFTER_DELETE, {
        id: entry.id,
        slug: entry.slug,
        contentType: (entry as { contentType?: { name: string } }).contentType?.name,
      });
    }

    return { message: `Entry #${id} moved to trash` };
  }

  /** Restore a soft-deleted entry. */
  async restore(id: number) {
    const entry = await this.prisma.entry.findUnique({
      where: { id },
      include: { contentType: true },
    });

    if (!entry || entry.deletedAt === null) {
      throw new NotFoundException(`Deleted entry #${id} not found`);
    }

    const restored = await this.prisma.entry.update({
      where: { id },
      data: { deletedAt: null },
      include: { contentType: true },
    });

    this.webhooks.fire('entry.restored', { id: restored.id, slug: restored.slug });

    return restored;
  }

  /** Permanently delete a soft-deleted entry. */
  async purge(id: number) {
    const entry = await this.prisma.entry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`Entry #${id} not found`);

    await this.prisma.entry.delete({ where: { id } });

    this.webhooks.fire('entry.purged', { id: entry.id, slug: entry.slug });

    return { message: `Entry #${id} permanently deleted` };
  }

  // ── Bulk operations ───────────────────────────────────────────────────────

  async bulkDelete(ids: number[]) {
    const result = await this.prisma.entry.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { affected: result.count };
  }

  async bulkPublish(ids: number[]) {
    const result = await this.prisma.entry.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { status: 'published' },
    });
    return { affected: result.count };
  }

  async bulkArchive(ids: number[]) {
    const result = await this.prisma.entry.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { status: 'archived' },
    });
    return { affected: result.count };
  }

  async bulkSetPendingReview(ids: number[]) {
    const result = await this.prisma.entry.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { status: 'pending_review' },
    });
    return { affected: result.count };
  }

  // ── Content versioning ────────────────────────────────────────────────────

  async listVersions(entryId: number) {
    await this.findOne(entryId); // ensures entry exists + not deleted
    const versions = await this.prisma.entryVersion.findMany({
      where: { entryId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return versions;
  }

  // ── Import / Export ─────────────────────────────────────────────────────────

  /**
   * Export all non-deleted entries for a content type as JSON array or RFC 4180 CSV.
   */
  async exportEntries(
    contentTypeId: number,
    format: 'json' | 'csv' = 'json',
  ): Promise<{ data: any; format: string; filename: string; contentType: string } | any[]> {
    const contentType = await this.prisma.contentType.findUnique({ where: { id: contentTypeId } });
    if (!contentType) throw new BadRequestException(`Content type #${contentTypeId} not found`);

    const entries = await this.prisma.entry.findMany({
      where: { contentTypeId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        publicId: true, slug: true, locale: true, status: true,
        data: true, seo: true, publishAt: true, createdAt: true, updatedAt: true,
      },
    });

    if (format === 'csv') {
      const csv = entriesToCsv(entries, (contentType.schema as any[]) || []);
      return {
        data: csv,
        format: 'csv',
        filename: `${contentType.name}-export.csv`,
        contentType: contentType.name,
      };
    }

    return entries;
  }

  /**
   * Import entries with support for JSON array, raw CSV, Dry-Run Preflight, and Duplicate Resolution.
   */
  async importEntries(
    contentTypeId: number,
    payload: any,
    actorId?: number,
  ): Promise<{
    dryRun?: boolean;
    valid?: boolean;
    total: number;
    toCreate: number;
    toUpdate: number;
    created?: number;
    updated?: number;
    skipped?: number;
    errors: string[];
    preview?: any[];
  }> {
    const contentType = await this.prisma.contentType.findUnique({ where: { id: contentTypeId } });
    if (!contentType) throw new BadRequestException(`Content type #${contentTypeId} not found`);

    let rows: Array<{ slug: string; locale?: string; status?: string; data?: Record<string, any>; seo?: any; publishAt?: string }> = [];
    let dryRun = false;
    let updateDuplicates = true;

    if (Array.isArray(payload)) {
      rows = payload;
    } else if (payload && typeof payload === 'object') {
      dryRun = !!payload.dryRun;
      updateDuplicates = payload.updateDuplicates !== false;
      if (payload.csvContent) {
        rows = parseCsvToEntries(payload.csvContent);
      } else if (Array.isArray(payload.entries)) {
        rows = payload.entries;
      }
    }

    if (rows.length === 0) {
      return {
        dryRun,
        valid: true,
        total: 0,
        toCreate: 0,
        toUpdate: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: ['No valid rows found in payload'],
        preview: [],
      };
    }

    // Identify which entries already exist
    const existingEntries = await this.prisma.entry.findMany({
      where: {
        contentTypeId,
        deletedAt: null,
      },
      select: { id: true, slug: true, locale: true },
    });
    const existingSet = new Set(existingEntries.map((e) => `${e.slug}::${e.locale}`));

    const errors: string[] = [];
    const preview: any[] = [];
    let toCreate = 0;
    let toUpdate = 0;

    // Validate rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const locale = row.locale ?? 'en';
      const rowNum = i + 1;
      let rowValid = true;
      let rowError: string | undefined;

      if (!row.slug) {
        rowError = `Row #${rowNum}: missing slug`;
        errors.push(rowError);
        rowValid = false;
      }

      const key = `${row.slug}::${locale}`;
      const isExisting = existingSet.has(key);

      if (rowValid) {
        if (isExisting) {
          toUpdate++;
        } else {
          toCreate++;
        }
      }

      preview.push({
        row: rowNum,
        slug: row.slug,
        locale,
        status: row.status || 'draft',
        isExisting,
        valid: rowValid,
        error: rowError,
        data: row.data || {},
      });
    }

    // If dryRun, return the validation report immediately without writing to DB
    if (dryRun) {
      return {
        dryRun: true,
        valid: errors.length === 0,
        total: rows.length,
        toCreate,
        toUpdate,
        errors,
        preview: preview.slice(0, 10),
      };
    }

    // Execute actual import
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const locale = row.locale ?? 'en';
      if (!row.slug) continue;

      try {
        const existing = await this.prisma.entry.findUnique({
          where: { contentTypeId_slug_locale: { contentTypeId, slug: row.slug, locale } },
        });

        const entryData = normalizeDataKeys(
          injectRepeaterIds((row.data ?? {}) as Record<string, any>),
        );

        if (existing && existing.deletedAt === null) {
          if (!updateDuplicates) {
            skipped++;
            continue;
          }
          await this.prisma.entry.update({
            where: { id: existing.id },
            data: {
              status: (row.status as any) ?? existing.status,
              data: entryData,
              seo: row.seo ?? existing.seo,
              publishAt: row.publishAt ? new Date(row.publishAt) : existing.publishAt,
            },
          });
          updated++;
        } else {
          await this.prisma.entry.create({
            data: {
              slug: row.slug,
              locale,
              status: (row.status as any) ?? 'draft',
              data: entryData,
              contentTypeId,
              seo: row.seo ?? null,
              publishAt: row.publishAt ? new Date(row.publishAt) : null,
            },
          });
          created++;
        }
      } catch (err: any) {
        errors.push(`${row.slug} (${locale}): ${err?.message ?? 'unknown error'}`);
      }
    }

    return {
      total: rows.length,
      toCreate,
      toUpdate,
      created,
      updated,
      skipped,
      errors,
    };
  }

  /**
   * Generate a signed preview token for a draft entry.
   * The token encodes the entry's internal id and expires in 1 hour.
   * Pass it to GET /api/:type/:slug/preview?token=<token> to read the draft.
   */
  async generatePreviewToken(entryId: number): Promise<{ token: string; expiresAt: string }> {
    const entry = await this.prisma.entry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException(`Entry #${entryId} not found`);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const token = this.jwtService.sign(
      { sub: 'preview', entryId: entry.id, publicId: entry.publicId },
      { expiresIn: '1h' },
    );
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async restoreVersion(entryId: number, versionId: number, actorId?: number) {
    const entry = await this.findOne(entryId);
    const version = await this.prisma.entryVersion.findUnique({
      where: { id: versionId },
    });

    if (!version || version.entryId !== entryId) {
      throw new NotFoundException(`Version #${versionId} not found for entry #${entryId}`);
    }

    // Snapshot current state before overwriting
    await this.prisma.entryVersion.create({
      data: {
        entryId: entry.id,
        slug: entry.slug,
        data: entry.data,
        status: entry.status,
        createdBy: actorId ?? null,
      },
    });

    const updated = await this.prisma.entry.update({
      where: { id: entryId },
      data: { data: version.data, status: version.status, slug: version.slug },
      include: { contentType: true },
    });

    this.webhooks.fire('entry.updated', {
      id: updated.id,
      slug: updated.slug,
      status: updated.status,
      contentType: updated.contentType?.name,
      restoredFromVersion: versionId,
    });

    this.realtime.notifyEntryUpdated({
      id: updated.id,
      slug: updated.slug,
      contentType: updated.contentType?.name ?? '',
      locale: updated.locale,
      status: updated.status,
    });

    return updated;
  }
}
