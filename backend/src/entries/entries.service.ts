import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';

@Injectable()
export class EntriesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateEntryDto) {
    const contentType = await this.prisma.contentType.findUnique({
      where: { id: dto.contentTypeId },
    });

    if (!contentType) {
      throw new BadRequestException(
        `Content type #${dto.contentTypeId} not found`,
      );
    }

    const existing = await this.prisma.entry.findUnique({
      where: {
        contentTypeId_slug: {
          contentTypeId: dto.contentTypeId,
          slug: dto.slug,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Slug "${dto.slug}" already exists in this content type`,
      );
    }

    return this.prisma.entry.create({
      data: {
        slug: dto.slug,
        data: dto.data as any,
        contentTypeId: dto.contentTypeId,
      },
      include: { contentType: true },
    });
  }

  async findAll(contentTypeId?: number) {
    return this.prisma.entry.findMany({
      where: contentTypeId ? { contentTypeId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { contentType: true },
    });
  }

  async findOne(id: number) {
    const entry = await this.prisma.entry.findUnique({
      where: { id },
      include: { contentType: true },
    });

    if (!entry) {
      throw new NotFoundException(`Entry #${id} not found`);
    }

    return entry;
  }

  async update(id: number, dto: UpdateEntryDto) {
    const entry = await this.findOne(id);

    const updateData: any = {};

    // Only update slug if provided — and check uniqueness
    if (dto.slug !== undefined) {
      if (dto.slug !== entry.slug) {
        const conflict = await this.prisma.entry.findUnique({
          where: {
            contentTypeId_slug: {
              contentTypeId: entry.contentTypeId,
              slug: dto.slug,
            },
          },
        });

        if (conflict) {
          throw new ConflictException(
            `Slug "${dto.slug}" already exists in this content type`,
          );
        }
      }
      updateData.slug = dto.slug;
    }

    // Only update data if explicitly provided — never wipe it with undefined
    if (dto.data !== undefined) {
      updateData.data = dto.data as any;
    }

    return this.prisma.entry.update({
      where: { id },
      data: updateData,
      include: { contentType: true },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.entry.delete({ where: { id } });
  }
}
