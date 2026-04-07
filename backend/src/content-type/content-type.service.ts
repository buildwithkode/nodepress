import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContentTypeDto } from './dto/create-content-type.dto';
import { UpdateContentTypeDto } from './dto/update-content-type.dto';
import { SchemaValidator } from '../fields/schema.validator';
import { FormGenerator } from '../fields/form.generator';
import { FieldDef } from '../fields/field.types';
import { normalizeKey } from '../common/normalize';

// These route names are already taken by static controllers
const RESERVED_NAMES = ['auth', 'media', 'entries', 'content-types', 'uploads'];

const normalizeName = (name: string): string =>
  name.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Normalize all field/sub-field/layout names in a raw schema to snake_case (runs before validation) */
const normalizeSchema = (schema: any[]): any[] =>
  schema.map((f) => {
    const field: any = { ...f, name: f.name ? normalizeKey(f.name) : f.name };
    if (field.options?.subFields) {
      field.options = {
        ...field.options,
        subFields: field.options.subFields.map((sf: any) => ({
          ...sf, name: sf.name ? normalizeKey(sf.name) : sf.name,
        })),
      };
    }
    if (field.options?.layouts) {
      field.options = {
        ...field.options,
        layouts: field.options.layouts.map((l: any) => ({
          ...l,
          name: l.name ? normalizeKey(l.name) : l.name,
          fields: l.fields?.map((lf: any) => ({
            ...lf, name: lf.name ? normalizeKey(lf.name) : lf.name,
          })),
        })),
      };
    }
    return field;
  });

@Injectable()
export class ContentTypeService {
  constructor(
    private prisma: PrismaService,
    private schemaValidator: SchemaValidator,
    private formGenerator: FormGenerator,
  ) {}

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

    // Normalize field names first, then validate
    const validatedSchema = this.schemaValidator.validate(normalizeSchema(dto.schema as any[]));

    return this.prisma.contentType.create({
      data: {
        name,
        schema: validatedSchema as any,
        allowedMethods: dto.allowedMethods ?? null,
      },
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

  async update(id: number, dto: UpdateContentTypeDto, actorId?: number) {
    const current = await this.findOne(id);

    const updateData: Partial<{ name: string; schema: any; allowedMethods: any }> = {};

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
      const validatedSchema = this.schemaValidator.validate(normalizeSchema(dto.schema as any[]));
      updateData.schema = validatedSchema as any;
    }

    if ('allowedMethods' in dto) {
      updateData.allowedMethods = dto.allowedMethods ?? null;
    }

    // Snapshot current schema before applying changes so history is preserved
    if (updateData.schema !== undefined) {
      await this.prisma.contentTypeSchemaVersion.create({
        data: {
          contentTypeId: id,
          schema: current.schema,
          changedBy: actorId ?? null,
        },
      });
    }

    return this.prisma.contentType.update({
      where: { id },
      data: updateData,
    });
  }

  /** List the schema change history for a content type (newest first, max 50). */
  async getSchemaHistory(id: number) {
    await this.findOne(id);
    return this.prisma.contentTypeSchemaVersion.findMany({
      where: { contentTypeId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getForm(id: number) {
    const contentType = await this.findOne(id);
    return this.formGenerator.generate(
      contentType.name,
      contentType.schema as unknown as FieldDef[],
    );
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.contentType.delete({ where: { id } });
  }
}
