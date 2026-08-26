import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';
import { CreateContentTypeDto } from './dto/create-content-type.dto';
import { UpdateContentTypeDto } from './dto/update-content-type.dto';
import { SchemaValidator } from '../fields/schema.validator';
import { FormGenerator } from '../fields/form.generator';
import { FieldDef } from '../fields/field.types';
import { normalizeKey } from '../common/normalize';

const ctCacheKey = (name: string) => `ct:meta:${name}`;
const CT_ALL_CACHE_KEY = 'ct:meta:all_content_types';

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
    private cache: AppCacheService,
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

    const created = await this.prisma.contentType.create({
      data: {
        name,
        displayName: dto.displayName?.trim() || null,
        schema: validatedSchema as any,
        allowedMethods: dto.allowedMethods ?? null,
      },
    });

    await this.cache.invalidatePrefix('ct:meta');
    return created;
  }

  async findAll() {
    const cached = await this.cache.get<any[]>(CT_ALL_CACHE_KEY);
    if (cached) return cached;

    const result = await this.prisma.contentType.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Cache for 60 seconds (invalidated instantly on any mutation)
    await this.cache.set(CT_ALL_CACHE_KEY, result, 60_000);
    return result;
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

    const updateData: Partial<{ name: string; displayName: string | null; schema: any; allowedMethods: any }> = {};

    if ('displayName' in dto) {
      updateData.displayName = dto.displayName?.trim() || null;
    }

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

    const updated = await this.prisma.contentType.update({
      where: { id },
      data: updateData,
    });

    // Bust all content-type caches
    await this.cache.invalidatePrefix('ct:meta');

    // Build schema-change impact warnings when schema was updated
    const warnings: string[] = [];
    if (updateData.schema) {
      warnings.push(...await this.buildSchemaWarnings(id, current.schema as any[], updateData.schema));
    }

    return warnings.length > 0 ? { ...updated, warnings } : updated;
  }

  /**
   * Compares old schema → new schema and returns human-readable warnings about
   * existing entries that will be affected by the change.
   */
  private async buildSchemaWarnings(
    contentTypeId: number,
    oldSchema: any[],
    newSchema: any[],
  ): Promise<string[]> {
    const entryCount = await this.prisma.entry.count({
      where: { contentTypeId, deletedAt: null },
    });
    if (entryCount === 0) return [];

    const warnings: string[] = [];
    const oldFieldMap = new Map(oldSchema.map((f: any) => [f.name, f]));
    const newFieldMap = new Map(newSchema.map((f: any) => [f.name, f]));

    // Removed fields — data still present in existing entries (no data loss, just schema drift)
    for (const [name] of oldFieldMap) {
      if (!newFieldMap.has(name)) {
        warnings.push(
          `Field "${name}" was removed. ${entryCount} existing entr${entryCount === 1 ? 'y' : 'ies'} still contain data for this field (no data loss — data is preserved in the JSON blob).`,
        );
      }
    }

    // Newly required fields — existing entries will fail validation on next save
    for (const [name, field] of newFieldMap) {
      if (field.required && !oldFieldMap.has(name)) {
        warnings.push(
          `Field "${name}" is new and required. ${entryCount} existing entr${entryCount === 1 ? 'y' : 'ies'} will fail validation until this field is populated.`,
        );
      }
      const old = oldFieldMap.get(name);
      if (old && !old.required && field.required) {
        warnings.push(
          `Field "${name}" is now required (was optional). ${entryCount} existing entr${entryCount === 1 ? 'y' : 'ies'} may have empty values and will fail validation until populated.`,
        );
      }
    }

    return warnings;
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
    const ct = await this.findOne(id);
    await this.prisma.contentType.delete({ where: { id } });
    await this.cache.invalidatePrefix('ct:meta');
    return ct;
  }

  // ─── Schema Export / Import (Migrations) ───────────────────────────────────

  /** Export schemas for one or all content types */
  async exportSchemas(id?: number) {
    if (id) {
      const ct = await this.findOne(id);
      return {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        contentTypes: [
          {
            name: ct.name,
            displayName: ct.displayName,
            schema: ct.schema,
            allowedMethods: ct.allowedMethods,
          },
        ],
      };
    }
    const all = await this.prisma.contentType.findMany({
      orderBy: { name: 'asc' },
    });
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      contentTypes: all.map((ct) => ({
        name: ct.name,
        displayName: ct.displayName,
        schema: ct.schema,
        allowedMethods: ct.allowedMethods,
      })),
    };
  }

  /** Import schemas with Dry-Run Validation and Duplicate Overwrite options */
  async importSchemas(
    dto: {
      contentTypes?: Array<{ name: string; displayName?: string; schema: any[]; allowedMethods?: string[] }>;
      dryRun?: boolean;
      overwrite?: boolean;
    },
    actorId?: number,
  ) {
    const list = dto.contentTypes ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      throw new BadRequestException('No contentTypes array provided in import payload');
    }

    const dryRun = !!dto.dryRun;
    const overwrite = dto.overwrite !== false;

    const existingList = await this.prisma.contentType.findMany({ select: { id: true, name: true } });
    const existingMap = new Map(existingList.map((c) => [c.name, c.id]));

    const errors: string[] = [];
    const preview: any[] = [];
    let toCreate = 0;
    let toUpdate = 0;

    for (let i = 0; i < list.length; i++) {
      const ct = list[i];
      const rawName = ct.name || '';
      const name = normalizeName(rawName);
      let valid = true;
      let errorMsg: string | undefined;

      if (!name) {
        errorMsg = `Content type #${i + 1} missing name`;
        errors.push(errorMsg);
        valid = false;
      } else if (RESERVED_NAMES.includes(name)) {
        errorMsg = `"${name}" is a reserved system route name`;
        errors.push(errorMsg);
        valid = false;
      }

      if (valid && (!ct.schema || !Array.isArray(ct.schema))) {
        errorMsg = `"${name}": schema must be an array of fields`;
        errors.push(errorMsg);
        valid = false;
      }

      const isExisting = existingMap.has(name);
      if (valid) {
        if (isExisting) toUpdate++;
        else toCreate++;
      }

      preview.push({
        name,
        displayName: ct.displayName || name,
        fieldCount: Array.isArray(ct.schema) ? ct.schema.length : 0,
        isExisting,
        valid,
        error: errorMsg,
      });
    }

    if (dryRun) {
      return {
        dryRun: true,
        valid: errors.length === 0,
        total: list.length,
        toCreate,
        toUpdate,
        errors,
        preview,
      };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const ct of list) {
      const name = normalizeName(ct.name);
      if (!name || RESERVED_NAMES.includes(name) || !Array.isArray(ct.schema)) continue;

      const validatedSchema = this.schemaValidator.validate(normalizeSchema(ct.schema));
      const existingId = existingMap.get(name);

      if (existingId) {
        if (!overwrite) {
          skipped++;
          continue;
        }
        await this.update(existingId, {
          displayName: ct.displayName,
          schema: validatedSchema as any,
          allowedMethods: ct.allowedMethods,
        }, actorId);
        updated++;
      } else {
        await this.create({
          name,
          displayName: ct.displayName,
          schema: validatedSchema as any,
          allowedMethods: ct.allowedMethods,
        });
        created++;
      }
    }

    return {
      success: true,
      total: list.length,
      created,
      updated,
      skipped,
      errors,
    };
  }
}
