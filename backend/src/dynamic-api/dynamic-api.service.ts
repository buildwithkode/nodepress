import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DynamicApiService {
  constructor(private prisma: PrismaService) {}

  private async resolveContentType(typeName: string) {
    // Normalize to lowercase so /api/Blog and /api/blog both work
    const name = typeName.toLowerCase();

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

    return this.prisma.entry.findMany({
      where: { contentTypeId: contentType.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        data: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(typeName: string, slug: string) {
    const contentType = await this.resolveContentType(typeName);

    const entry = await this.prisma.entry.findUnique({
      where: {
        contentTypeId_slug: {
          contentTypeId: contentType.id,
          slug,
        },
      },
      select: {
        id: true,
        slug: true,
        data: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!entry) {
      throw new NotFoundException(
        `Entry with slug "${slug}" not found in "${typeName}"`,
      );
    }

    return entry;
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
      data: { slug, data: data as any, contentTypeId: contentType.id },
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
      data: { data: data as any },
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
