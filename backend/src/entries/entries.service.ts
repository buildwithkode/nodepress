import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { DataValidator } from '../fields/data.validator';
import { FieldDef } from '../fields/field.types';
import { normalizeDataKeys, injectRepeaterIds, needsRepeaterIds } from '../common/normalize';
import { sanitizeEntryData } from '../common/sanitize';

export interface AdminListQuery {
  contentTypeId?: number;
  status?: string;          // filter by status (draft | published | archived)
  deleted?: boolean;        // true = show only soft-deleted entries
  search?: string;          // full-text search on slug + data
  page?: number;
  limit?: number;
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
  ) {}

  async create(dto: CreateEntryDto, actorId?: number) {
    const contentType = await this.prisma.contentType.findUnique({
      where: { id: dto.contentTypeId },
    });

    if (!contentType) {
      throw new BadRequestException(`Content type #${dto.contentTypeId} not found`);
    }

    this.dataValidator.validate(
      dto.data as Record<string, unknown>,
      contentType.schema as unknown as FieldDef[],
    );

    const existing = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug: { contentTypeId: dto.contentTypeId, slug: dto.slug } },
    });

    if (existing) {
      throw new ConflictException(`Slug "${dto.slug}" already exists in this content type`);
    }

    const entry = await this.prisma.entry.create({
      data: {
        slug: dto.slug,
        status: dto.status ?? 'published',
        data: normalizeDataKeys(
          sanitizeEntryData(
            injectRepeaterIds(dto.data as Record<string, any>),
            contentType.schema as unknown as FieldDef[],
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

    return entry;
  }

  async findAll(query: AdminListQuery = {}): Promise<PaginatedResult<any>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.contentTypeId) where.contentTypeId = query.contentTypeId;
    if (query.status) where.status = query.status;

    if (query.deleted) {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
    }

    // Full-text search: match on slug or data text representation
    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      const matches = await this.prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM entries
        WHERE LOWER(slug) LIKE LOWER(${term})
           OR LOWER(data::text) LIKE LOWER(${term})
      `;
      where.id = { in: matches.map((m) => m.id) };
    }

    const [total, entries] = await Promise.all([
      this.prisma.entry.count({ where }),
      this.prisma.entry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { contentType: true },
      }),
    ]);

    const data = await Promise.all(
      entries.map(async (e) => {
        let entryData = e.data as Record<string, any>;
        if (needsRepeaterIds(entryData)) {
          entryData = injectRepeaterIds(entryData);
          await this.prisma.entry.update({ where: { id: e.id }, data: { data: entryData as any } });
        }
        return { ...e, data: entryData };
      }),
    );

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
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
      await this.prisma.entry.update({ where: { id: entry.id }, data: { data: data as any } });
    }
    return { ...entry, data };
  }

  async update(id: number, dto: UpdateEntryDto, actorId?: number) {
    const entry = await this.findOne(id);

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
          where: { contentTypeId_slug: { contentTypeId: entry.contentTypeId, slug: dto.slug } },
        });
        if (conflict) {
          throw new ConflictException(`Slug "${dto.slug}" already exists in this content type`);
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

    return updated;
  }

  /** Soft delete — sets deletedAt timestamp. */
  async remove(id: number) {
    const entry = await this.findOne(id);
    await this.prisma.entry.update({ where: { id }, data: { deletedAt: new Date() } });

    this.webhooks.fire('entry.deleted', { id: entry.id, slug: entry.slug });

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

    return updated;
  }
}
