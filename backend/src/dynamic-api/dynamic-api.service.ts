import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeDataKeys, injectRepeaterIds, needsRepeaterIds } from '../common/normalize';

type MethodKey = 'list' | 'read' | 'create' | 'update' | 'delete';

@Injectable()
export class DynamicApiService {
  constructor(private prisma: PrismaService) {}

  private async resolveContentType(typeName: string, method: MethodKey) {
    // Normalize to snake_case so /api/Title_Name and /api/title_name both work
    const name = typeName.trim().toLowerCase().replace(/[\s-]+/g, '_');

    const contentType = await this.prisma.contentType.findUnique({
      where: { name },
    });

    if (!contentType) {
      throw new NotFoundException(`Content type "${name}" does not exist`);
    }

    // null = all methods enabled (backward compat); otherwise check the list
    const allowed = contentType.allowedMethods as string[] | null;
    if (allowed !== null && !allowed.includes(method)) {
      throw new NotFoundException(`Content type "${name}" does not exist`);
    }

    return contentType;
  }

  async findAll(typeName: string) {
    const contentType = await this.resolveContentType(typeName, 'list');

    const entries = await this.prisma.entry.findMany({
      where: { contentTypeId: contentType.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, publicId: true, slug: true, data: true, createdAt: true, updatedAt: true },
    });

    // Lazy migration: persist random IDs for any entry that still lacks them
    const results = await Promise.all(
      entries.map(async (e) => {
        let data = normalizeDataKeys(e.data as Record<string, any>);
        if (needsRepeaterIds(data)) {
          data = injectRepeaterIds(data);
          await this.prisma.entry.update({ where: { id: e.id }, data: { data: data as any } });
        }
        // Expose publicId as "id" — hide internal numeric id
        const { id: _internal, publicId, ...rest } = e;
        return { id: publicId, ...rest, data };
      }),
    );
    return results;
  }

  async findOne(typeName: string, slug: string) {
    const contentType = await this.resolveContentType(typeName, 'read');

    const entry = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug: { contentTypeId: contentType.id, slug } },
      select: { id: true, publicId: true, slug: true, data: true, createdAt: true, updatedAt: true },
    });

    if (!entry) {
      throw new NotFoundException(`Entry with slug "${slug}" not found in "${typeName}"`);
    }

    let data = normalizeDataKeys(entry.data as Record<string, any>);
    if (needsRepeaterIds(data)) {
      data = injectRepeaterIds(data);
      await this.prisma.entry.update({ where: { id: entry.id }, data: { data: data as any } });
    }
    const { id: _internal, publicId, ...rest } = entry;
    return { id: publicId, ...rest, data };
  }

  async create(typeName: string, slug: string, data: Record<string, any>) {
    const contentType = await this.resolveContentType(typeName, 'create');

    const existing = await this.prisma.entry.findUnique({
      where: {
        contentTypeId_slug: { contentTypeId: contentType.id, slug },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Slug "${slug}" already exists in "${typeName}"`,
      );
    }

    const created = await this.prisma.entry.create({
      data: { slug, data: normalizeDataKeys(injectRepeaterIds(data)) as any, contentTypeId: contentType.id },
      select: { id: true, publicId: true, slug: true, data: true, createdAt: true, updatedAt: true },
    });
    const { id: _internal, publicId, ...rest } = created;
    return { id: publicId, ...rest };
  }

  async update(typeName: string, slug: string, data: Record<string, any>) {
    const contentType = await this.resolveContentType(typeName, 'update');

    const entry = await this.prisma.entry.findUnique({
      where: {
        contentTypeId_slug: { contentTypeId: contentType.id, slug },
      },
    });

    if (!entry) {
      throw new NotFoundException(
        `Entry with slug "${slug}" not found in "${typeName}"`,
      );
    }

    const updated = await this.prisma.entry.update({
      where: { id: entry.id },
      data: { data: normalizeDataKeys(injectRepeaterIds(data)) as any },
      select: { id: true, publicId: true, slug: true, data: true, createdAt: true, updatedAt: true },
    });
    const { id: _internal, publicId, ...rest } = updated;
    return { id: publicId, ...rest };
  }

  async remove(typeName: string, slug: string) {
    const contentType = await this.resolveContentType(typeName, 'delete');

    const entry = await this.prisma.entry.findUnique({
      where: {
        contentTypeId_slug: { contentTypeId: contentType.id, slug },
      },
    });

    if (!entry) {
      throw new NotFoundException(
        `Entry with slug "${slug}" not found in "${typeName}"`,
      );
    }

    await this.prisma.entry.delete({ where: { id: entry.id } });

    return { message: `Entry "${slug}" deleted from "${typeName}"` };
  }
}
