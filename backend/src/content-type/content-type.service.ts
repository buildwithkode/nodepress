import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';
import { diffSchemas } from './schema-diff';
import { CreateContentTypeDto } from './dto/create-content-type.dto';
import { UpdateContentTypeDto } from './dto/update-content-type.dto';
import { SchemaValidator } from '../fields/schema.validator';
import { FormGenerator } from '../fields/form.generator';
import { FieldIndexService } from './field-index.service';
import { normalizePreviewUrl } from './preview-url';
import { FieldDef, RelationFieldDef, isReverseRelation } from '../fields/field.types';
import { normalizeKey } from '../common/normalize';
import { Optional } from '@nestjs/common';
import { ComponentsService } from '../components/components.service';
import { ChoiceListsService } from '../choice-lists/choice-lists.service';
import type { Choice } from '../choice-lists/choice-list.util';
import {
  FieldMigrations, MigrationStep, impactQuery, planMigrations, removedNestedFields, retypedFields, stepQuery,
} from './field-migration';

/** Field names in migrations get the same snake_case normalization as the schema. */
const normalizeMigrations = (m: FieldMigrations): FieldMigrations => ({
  renames: m.renames?.map((r) => ({ from: normalizeKey(r.from), to: normalizeKey(r.to) })),
  convert: m.convert?.map(normalizeKey),
  drop: m.drop?.map(normalizeKey),
});

const ctCacheKey = (name: string) => `ct:meta:${name}`;
const CT_ALL_CACHE_KEY = 'ct:meta:all_content_types';

// These route names are already taken by static controllers
const RESERVED_NAMES = ['auth', 'media', 'entries', 'content-types', 'uploads', 'components', 'roles', 'redirects', 'import', 'choice-lists', 'choice_lists'];

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
    private fieldIndexes: FieldIndexService,
    @Optional() private components?: ComponentsService,
    @Optional() private choiceLists?: ChoiceListsService,
  ) {}

  /** Copy reusable components' fields into the group/repeater fields that use them (see ComponentsService). */
  private async expandComponents(schema: any[], bundle?: Map<string, any[]>, lists?: Map<string, Choice[]>): Promise<any[]> {
    const expanded = this.components ? await this.components.expand(schema, bundle) : schema;
    // Then shared choice lists — after components, whose fields may hold select fields that use one.
    return this.choiceLists ? this.choiceLists.expand(expanded, lists) : expanded;
  }

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
    const validatedSchema = this.schemaValidator.validate(normalizeSchema(await this.expandComponents(dto.schema as any[])));
    await this.assertReverseFields(name, validatedSchema);

    const created = await this.prisma.contentType.create({
      data: {
        name,
        displayName: dto.displayName?.trim() || null,
        schema: validatedSchema as any,
        allowedMethods: dto.allowedMethods ?? null,
        previewUrl: normalizePreviewUrl(dto.previewUrl),
      },
    });

    await this.cache.invalidatePrefix('ct:meta');
    void this.fieldIndexes.sync(created.id, validatedSchema as any[]);
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

    const updateData: Partial<{ name: string; displayName: string | null; schema: any; allowedMethods: any; previewUrl: string | null }> = {};

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
      const validatedSchema = this.schemaValidator.validate(normalizeSchema(await this.expandComponents(dto.schema as any[])));
      await this.assertReverseFields(updateData.name ?? current.name, validatedSchema);
      updateData.schema = validatedSchema as any;
    }

    const steps = dto.fieldMigrations
      ? planMigrations(current.schema as any[], (updateData.schema ?? current.schema) as any[], normalizeMigrations(dto.fieldMigrations))
      : [];

    if ('allowedMethods' in dto) {
      updateData.allowedMethods = dto.allowedMethods ?? null;
    }

    if ('previewUrl' in dto) {
      updateData.previewUrl = normalizePreviewUrl(dto.previewUrl);
    }

    // Snapshot current schema before applying changes so history is preserved
    const snapshot = updateData.schema !== undefined
      ? { contentTypeId: id, schema: current.schema as any, changedBy: actorId ?? null }
      : null;

    let updated;
    if (steps.length) {
      // Data and schema change together or not at all.
      updated = await this.prisma.$transaction(async (tx) => {
        if (snapshot) await tx.contentTypeSchemaVersion.create({ data: snapshot });
        for (const step of steps) {
          const q = stepQuery(id, step);
          await tx.$executeRawUnsafe(q.sql, ...q.params);
        }
        return tx.contentType.update({ where: { id }, data: updateData });
      }, { timeout: 120_000 });
      // Entries were rewritten with SQL, which the operation hooks don't see:
      // write the content type again after commit so the public cache, search
      // index and GraphQL schema refresh for this type.
      await this.prisma.contentType.update({ where: { id }, data: { updatedAt: new Date() } });
      await this.renameReverseMappings(updated.name, steps);
    } else {
      if (snapshot) await this.prisma.contentTypeSchemaVersion.create({ data: snapshot });
      updated = await this.prisma.contentType.update({
        where: { id },
        data: updateData,
      });
    }

    // Bust all content-type caches
    await this.cache.invalidatePrefix('ct:meta');
    if (updateData.schema) void this.fieldIndexes.sync(id, updateData.schema);

    // Build schema-change impact warnings when schema was updated
    const warnings: string[] = [];
    if (updateData.schema) {
      warnings.push(...await this.buildSchemaWarnings(id, current.schema as any[], updateData.schema, steps));
    }

    const result: any = steps.length ? { ...updated, migrated: steps } : updated;
    return warnings.length > 0 ? { ...result, warnings } : result;
  }

  /**
   * What a schema change would do to existing entries: per migration step the
   * number of entries holding the field (and for conversions, how many values
   * would be removed), plus the retyped fields that could be converted.
   */
  async schemaImpact(id: number, dto: UpdateContentTypeDto) {
    const current = await this.findOne(id);
    const oldSchema = current.schema as any[];
    const newSchema = dto.schema !== undefined
      ? this.schemaValidator.validate(normalizeSchema(await this.expandComponents(dto.schema as any[]))) as any[]
      : oldSchema;
    const migrations = normalizeMigrations(dto.fieldMigrations ?? {});
    const steps = planMigrations(oldSchema, newSchema, migrations);

    const impact = [];
    for (const step of steps) {
      const q = impactQuery(id, step);
      const [row] = await this.prisma.$queryRawUnsafe<{ entries: number; lost: number }[]>(q.sql, ...q.params);
      impact.push({ ...step, entries: row?.entries ?? 0, lost: row?.lost ?? 0 });
    }
    return {
      entryCount: await this.prisma.entry.count({ where: { contentTypeId: id } }),
      diff: diffSchemas(oldSchema, newSchema),
      steps: impact,
      retyped: retypedFields(oldSchema, newSchema, migrations.renames),
      // Fields removed from inside a group, repeater or layout that still exists — candidates for `drop`.
      removedNested: removedNestedFields(oldSchema, newSchema, migrations.renames),
      warnings: await this.buildSchemaWarnings(id, oldSchema, newSchema, steps),
    };
  }

  /** Reverse fields on other types that read a renamed relation field follow the rename. */
  private async renameReverseMappings(typeName: string, steps: MigrationStep[]) {
    const renames = new Map(steps.filter((s) => s.kind === 'rename' && !s.container).map((s) => [s.from!, s.field]));
    if (!renames.size) return;
    const types = await this.prisma.contentType.findMany();
    for (const ct of types) {
      let changed = false;
      const schema = (ct.schema as any[]).map((f) => {
        const mappedBy = f?.type === 'relation' ? f.options?.mappedBy : undefined;
        if (mappedBy && f.options.relatedContentType === typeName && renames.has(mappedBy)) {
          changed = true;
          return { ...f, options: { ...f.options, mappedBy: renames.get(mappedBy) } };
        }
        return f;
      });
      if (changed) {
        await this.prisma.contentType.update({ where: { id: ct.id }, data: { schema } });
      }
    }
    await this.cache.invalidatePrefix('ct:meta');
  }

  /**
   * A reverse field (`options.mappedBy`) must name a forward relation field on
   * the related type that points back at this one.
   */
  private async assertReverseFields(typeName: string, schema: FieldDef[]) {
    const errors: string[] = [];
    for (const field of schema.filter((f): f is RelationFieldDef => isReverseRelation(f))) {
      const { relatedContentType, mappedBy } = field.options;
      const related = relatedContentType === typeName
        ? { schema }
        : await this.prisma.contentType.findUnique({ where: { name: relatedContentType } });
      if (!related) {
        errors.push(`${field.name}: content type "${relatedContentType}" doesn't exist`);
        continue;
      }
      const back = (related.schema as unknown as FieldDef[]).find((f) => f.name === mappedBy);
      if (!back || back.type !== 'relation' || isReverseRelation(back)) {
        errors.push(`${field.name}: "${relatedContentType}" has no relation field "${mappedBy}"`);
      } else if ((back as RelationFieldDef).options?.relatedContentType !== typeName) {
        errors.push(`${field.name}: "${relatedContentType}.${mappedBy}" links to "${(back as RelationFieldDef).options?.relatedContentType}", not "${typeName}"`);
      }
    }
    if (errors.length) throw new BadRequestException({ message: 'Invalid schema', errors });
  }

  /**
   * Compares old schema → new schema and returns human-readable warnings about
   * existing entries that will be affected by the change.
   */
  private async buildSchemaWarnings(
    contentTypeId: number,
    oldSchema: any[],
    newSchema: any[],
    steps: MigrationStep[] = [],
  ): Promise<string[]> {
    const entryCount = await this.prisma.entry.count({
      where: { contentTypeId, deletedAt: null },
    });
    if (entryCount === 0) return [];

    const warnings: string[] = [];
    const oldFieldMap = new Map(oldSchema.map((f: any) => [f.name, f]));
    const newFieldMap = new Map(newSchema.map((f: any) => [f.name, f]));
    const handled = new Set(steps.flatMap((s) => [s.field, s.from].filter(Boolean) as string[]));

    for (const { field, fromType, toType } of retypedFields(oldSchema, newSchema, steps
      .filter((s) => s.kind === 'rename').map((s) => ({ from: s.from!, to: s.field })))) {
      if (!steps.some((s) => s.kind === 'convert' && s.field === field)) {
        warnings.push(
          `Field "${field}" changed from ${fromType} to ${toType}. Existing values were not converted and may fail validation on the next save.`,
        );
      }
    }

    // Removed fields — data still present in existing entries (no data loss, just schema drift)
    for (const [name] of oldFieldMap) {
      if (!newFieldMap.has(name) && !handled.has(name)) {
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
    void this.fieldIndexes.dropAll(id);
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
            previewUrl: ct.previewUrl,
          },
        ],
        components: (await this.components?.exportComponents([ct.schema])) ?? [],
        choiceLists: (await this.choiceLists?.exportLists([ct.schema])) ?? [],
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
        previewUrl: ct.previewUrl,
      })),
      components: (await this.components?.exportComponents()) ?? [],
      choiceLists: (await this.choiceLists?.exportLists()) ?? [],
    };
  }

  /** Import schemas with Dry-Run Validation and Duplicate Overwrite options */
  async importSchemas(
    dto: {
      contentTypes?: Array<{ name: string; displayName?: string; schema: any[]; allowedMethods?: string[]; previewUrl?: string | null }>;
      dryRun?: boolean;
      overwrite?: boolean;
      components?: Array<{ name: string; displayName?: string | null; description?: string | null; fields: any[] }>;
      choiceLists?: Array<{ name: string; label?: string; description?: string | null; choices: unknown[] }>;
    },
    actorId?: number,
  ) {
    const list = dto.contentTypes ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      throw new BadRequestException('No contentTypes array provided in import payload');
    }

    const dryRun = !!dto.dryRun;
    const overwrite = dto.overwrite !== false;

    const existingList = await this.prisma.contentType.findMany({ select: { id: true, name: true, schema: true } });
    const existingMap = new Map(existingList.map((c) => [c.name, c.id]));
    const existingSchemas = new Map(existingList.map((c) => [c.name, c.schema as any[]]));
    // Validated schemas, so nothing is written unless every one of them is valid.
    const validated = new Map<string, any[]>();

    const errors: string[] = [];
    // The bundle's components, validated — its schemas expand against them.
    const bundleComponents = await this.components?.prepareImport(dto.components, errors, overwrite);
    // …and its choice lists (written before components and content types).
    const bundleLists = await this.choiceLists?.prepareImport(dto.choiceLists, errors, overwrite);
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

      // Run the same validation the real import runs, so a dry run that passes
      // means the import will too.
      if (valid) {
        try {
          validated.set(name, this.schemaValidator.validate(normalizeSchema(await this.expandComponents(ct.schema, bundleComponents, bundleLists))));
          normalizePreviewUrl(ct.previewUrl);
        } catch (err: any) {
          errorMsg = `"${name}": ${err?.response?.message ?? err?.message ?? 'invalid schema'}`;
          errors.push(errorMsg);
          valid = false;
        }
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
        // What would change for an existing type. Removed fields keep their
        // data in existing entries; it is just no longer shown or validated.
        changes: isExisting && valid ? diffSchemas(existingSchemas.get(name), validated.get(name)) : undefined,
      });
    }

    // All or nothing: never apply part of a bundle that contains an invalid schema.
    if (!dryRun && errors.length > 0) {
      throw new BadRequestException({ message: 'Import aborted — nothing was changed', errors });
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

    // Components first, so the content types below expand against them.
    const choiceLists = await this.choiceLists?.applyImport(dto.choiceLists, overwrite, actorId);
    const components = await this.components?.applyImport(dto.components, overwrite, actorId);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const ct of list) {
      const name = normalizeName(ct.name);
      if (!name || RESERVED_NAMES.includes(name) || !Array.isArray(ct.schema)) continue;

      const validatedSchema = validated.get(name)!;
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
          // Bundles from before previewUrl existed leave it alone.
          ...('previewUrl' in ct ? { previewUrl: ct.previewUrl } : {}),
        }, actorId);
        updated++;
      } else {
        await this.create({
          name,
          displayName: ct.displayName,
          schema: validatedSchema as any,
          allowedMethods: ct.allowedMethods,
          previewUrl: ct.previewUrl,
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
      components,
      choiceLists,
      errors,
    };
  }
}
