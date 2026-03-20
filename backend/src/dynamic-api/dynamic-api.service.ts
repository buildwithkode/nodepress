import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeDataKeys } from '../common/normalize';

@Injectable()
export class DynamicApiService {
  constructor(private prisma: PrismaService) {}

  private async resolveContentType(typeName: string) {
    // Normalize to snake_case so /api/Title_Name and /api/title_name both work
    const name = typeName.trim().toLowerCase().replace(/[\s-]+/g, '_');

    const contentType = await this.prisma.contentType.findUnique({
      where: { name },
    });

    if (!contentType) {
      throw new NotFoundException(`Content type "${name}" does not exist`);
    }

    return contentType;
  }

  async findAll(typeName: string) {
    const contentType = await this.resolveContentType(typeName);

    const entries = await this.prisma.entry.findMany({
      where: { contentTypeId: contentType.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, slug: true, data: true, createdAt: true, updatedAt: true },
    });

    return entries.map((e) => ({ ...e, data: normalizeDataKeys(e.data as Record<string, any>) }));
  }

  async findOne(typeName: string, slug: string) {
    const contentType = await this.resolveContentType(typeName);

    const entry = await this.prisma.entry.findUnique({
      where: { contentTypeId_slug: { contentTypeId: contentType.id, slug } },
      select: { id: true, slug: true, data: true, createdAt: true, updatedAt: true },
    });

    if (!entry) {
      throw new NotFoundException(`Entry with slug "${slug}" not found in "${typeName}"`);
    }

    return { ...entry, data: normalizeDataKeys(entry.data as Record<string, any>) };
  }

  async create(typeName: string, slug: string, data: Record<string, any>) {
    const contentType = await this.resolveContentType(typeName);

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

    return this.prisma.entry.create({
      data: { slug, data: normalizeDataKeys(data) as any, contentTypeId: contentType.id },
      select: {
        id: true,
        slug: true,
        data: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(typeName: string, slug: string, data: Record<string, any>) {
    const contentType = await this.resolveContentType(typeName);

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

    return this.prisma.entry.update({
      where: { id: entry.id },
      data: { data: normalizeDataKeys(data) as any },
      select: {
        id: true,
        slug: true,
        data: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(typeName: string, slug: string) {
    const contentType = await this.resolveContentType(typeName);

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
