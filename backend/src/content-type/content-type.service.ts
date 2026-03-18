import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContentTypeDto } from './dto/create-content-type.dto';
import { UpdateContentTypeDto } from './dto/update-content-type.dto';

// These route names are already taken by static controllers
const RESERVED_NAMES = ['auth', 'media', 'entries', 'content-types', 'uploads'];

const normalizeName = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, '_');

@Injectable()
export class ContentTypeService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateContentTypeDto) {
    const name = normalizeName(dto.name);

    if (RESERVED_NAMES.includes(name)) {
      throw new BadRequestException(
        `"${name}" is a reserved name and cannot be used as a content type`,
      );
    }

    const existing = await this.prisma.contentType.findUnique({
      where: { name },
    });

    if (existing) {
      throw new ConflictException(`Content type "${name}" already exists`);
    }

    return this.prisma.contentType.create({
      data: { name, schema: dto.schema as any },
    });
  }

  async findAll() {
    return this.prisma.contentType.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const contentType = await this.prisma.contentType.findUnique({
      where: { id },
    });

    if (!contentType) {
      throw new NotFoundException(`Content type #${id} not found`);
    }

    return contentType;
  }

  async update(id: number, dto: UpdateContentTypeDto) {
    await this.findOne(id);

    const updateData: any = {};

    if (dto.name !== undefined) {
      const name = normalizeName(dto.name);

      if (RESERVED_NAMES.includes(name)) {
        throw new BadRequestException(
          `"${name}" is a reserved name and cannot be used as a content type`,
        );
      }

      // Check name uniqueness against other content types
      const conflict = await this.prisma.contentType.findFirst({
        where: { name, NOT: { id } },
      });

      if (conflict) {
        throw new ConflictException(`Content type "${name}" already exists`);
      }

      updateData.name = name;
    }

    if (dto.schema !== undefined) {
      updateData.schema = dto.schema as any;
    }

    return this.prisma.contentType.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.contentType.delete({ where: { id } });
  }
}
