import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { SchemaValidator } from '../fields/schema.validator';
import { normalizeKey } from '../common/normalize';
import { CreateComponentDto, UpdateComponentDto } from './dto/component.dto';

const NAME_RE = /^[a-z_][a-z0-9_]*$/;

export const normalizeComponentName = (name: string): string =>
  name.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** A group (one) or repeater (many) field whose subFields come from a component. */
export function componentOf(field: any): string | null {
  if (!field || (field.type !== 'group' && field.type !== 'repeater')) return null;
  const c = field.options?.component;
  return typeof c === 'string' && c.trim() ? normalizeComponentName(c) : null;
}

/** Content type fields that use a component. */
export interface ComponentUsage {
  contentTypeId: number;
  contentType: string;
  displayName: string | null;
  field: string;
  type: 'group' | 'repeater';
}

function usageIn(
  contentTypes: Array<{ id: number; name: string; displayName?: string | null; schema: unknown }>,
  name: string,
): ComponentUsage[] {
  const out: ComponentUsage[] = [];
  for (const ct of contentTypes) {
    if (!Array.isArray(ct.schema)) continue;
    for (const f of ct.schema as any[]) {
      if (componentOf(f) === name) {
        out.push({ contentTypeId: ct.id, contentType: ct.name, displayName: ct.displayName ?? null, field: f.name, type: f.type });
      }
    }
  }
  return out;
}

const errorText = (err: any): string => {
  const res = err?.response;
  const list = Array.isArray(res?.errors) ? `: ${res.errors.join('; ')}` : '';
  return `${res?.message ?? err?.message ?? 'invalid'}${list}`;
};

/**
 * Reusable components — a named list of simple fields that content types use
 * as a group field (one) or a repeater field (many) with `options.component`.
 *
 * The field's `options.subFields` is a denormalized copy of the component's
 * fields: expand() fills it in on every content type write, and updating a
 * component rewrites every content type that uses it through
 * ContentTypeService.update (schema versions, caches, GraphQL, field indexes).
 * Everything that reads schemas (DataValidator, GraphQL, type generator, the
 * admin entry form) sees an ordinary group/repeater.
 */
@Injectable()
export class ComponentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schemaValidator: SchemaValidator,
    private readonly moduleRef: ModuleRef,
  ) {}

  // ─── Validation ────────────────────────────────────────────────────────────

  /** Validate a component's fields with the group/repeater subField rules. */
  validateFields(raw: unknown): any[] {
    if (!Array.isArray(raw)) throw new BadRequestException('fields must be an array of field definitions');
    const fields = raw.map((f: any) =>
      f && typeof f === 'object' && typeof f.name === 'string' ? { ...f, name: normalizeKey(f.name) } : f,
    );
    try {
      this.schemaValidator.validate([{ name: 'component', type: 'group', options: { subFields: fields } }]);
    } catch (err: any) {
      const errors: string[] = err?.response?.errors;
      if (!Array.isArray(errors)) throw err;
      throw new BadRequestException({
        message: 'Invalid component fields',
        errors: errors.map((e) => e.replace('schema[0].options.subFields', 'fields')),
      });
    }
    return fields;
  }

  private validName(raw: unknown): string {
    const name = typeof raw === 'string' ? normalizeComponentName(raw) : '';
    if (!NAME_RE.test(name)) {
      throw new BadRequestException('name must be lowercase letters, digits, or underscores, starting with a letter or underscore');
    }
    return name;
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async findAll() {
    const [components, contentTypes] = await Promise.all([
      this.prisma.component.findMany({ orderBy: { name: 'asc' } }),
      this.allContentTypes(),
    ]);
    return components.map((c) => ({ ...c, usage: usageIn(contentTypes, c.name) }));
  }

  async findOne(id: number) {
    const component = await this.prisma.component.findUnique({ where: { id } });
    if (!component) throw new NotFoundException(`Component #${id} not found`);
    return { ...component, usage: usageIn(await this.allContentTypes(), component.name) };
  }

  async create(dto: CreateComponentDto) {
    const name = this.validName(dto.name);
    const fields = this.validateFields(dto.fields);
    if (await this.prisma.component.findUnique({ where: { name } })) {
      throw new ConflictException(`Component "${name}" already exists`);
    }
    return this.prisma.component.create({
      data: {
        name,
        displayName: dto.displayName?.trim() || null,
        description: dto.description?.trim() || null,
        fields: fields as any,
      },
    });
  }

  /**
   * Update a component, then rewrite the subFields (and, on a rename, the
   * `options.component` name) of every content type field that uses it.
   */
  async update(id: number, dto: UpdateComponentDto, actorId?: number) {
    const current = await this.prisma.component.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Component #${id} not found`);

    const data: Partial<{ name: string; displayName: string | null; description: string | null; fields: any }> = {};
    if (dto.name !== undefined) {
      const name = this.validName(dto.name);
      if (name !== current.name && await this.prisma.component.findUnique({ where: { name } })) {
        throw new ConflictException(`Component "${name}" already exists`);
      }
      data.name = name;
    }
    if ('displayName' in dto) data.displayName = dto.displayName?.trim() || null;
    if ('description' in dto) data.description = dto.description?.trim() || null;
    if (dto.fields !== undefined) data.fields = this.validateFields(dto.fields);

    const updated = await this.prisma.component.update({ where: { id }, data });
    const { updatedContentTypes, errors } = await this.propagate(current.name, updated, actorId);
    return {
      ...updated,
      updatedContentTypes,
      ...(errors.length ? { propagationErrors: errors } : {}),
    };
  }

  async remove(id: number) {
    const component = await this.findOne(id);
    if (component.usage.length) {
      const where = [...new Set(component.usage.map((u) => u.contentType))].join(', ');
      throw new ConflictException(`Component "${component.name}" is used by ${where} — remove those fields first`);
    }
    await this.prisma.component.delete({ where: { id } });
    return component;
  }

  // ─── Expansion & propagation ───────────────────────────────────────────────

  /**
   * Replace `options.subFields` of every group/repeater field that names a
   * component with that component's fields. `overrides` (name → fields) wins
   * over the database — an import bundle's components, validated before they
   * are written. Throws 400 for an unknown component.
   */
  async expand<T = any>(schema: T, overrides?: Map<string, any[]>): Promise<T> {
    if (!Array.isArray(schema)) return schema;
    const names = [...new Set(schema.map(componentOf).filter((n): n is string => !!n))];
    if (!names.length) return schema;

    const fields = new Map<string, any[]>();
    for (const n of names) if (overrides?.has(n)) fields.set(n, overrides.get(n)!);
    const fromDb = names.filter((n) => !fields.has(n));
    if (fromDb.length) {
      const rows = await this.prisma.component.findMany({ where: { name: { in: fromDb } } });
      for (const r of rows) fields.set(r.name, r.fields as any[]);
    }
    const missing = names.filter((n) => !fields.has(n));
    if (missing.length) {
      throw new BadRequestException(`Unknown component${missing.length > 1 ? 's' : ''}: ${missing.map((m) => `"${m}"`).join(', ')}`);
    }

    return schema.map((f: any) => {
      const n = componentOf(f);
      if (!n) return f;
      return { ...f, options: { ...f.options, component: n, subFields: structuredClone(fields.get(n)) } };
    }) as T;
  }

  private async propagate(
    oldName: string,
    component: { name: string; fields: unknown },
    actorId?: number,
  ): Promise<{ updatedContentTypes: Array<{ id: number; name: string }>; errors: string[] }> {
    const updatedContentTypes: Array<{ id: number; name: string }> = [];
    const errors: string[] = [];
    const users = (await this.allContentTypes()).filter((ct) => usageIn([ct], oldName).length);
    if (!users.length) return { updatedContentTypes, errors };

    // Resolved lazily: ContentTypeModule imports this module, so a static
    // import of ContentTypeService here would be a cycle.
    const { ContentTypeService } = await import('../content-type/content-type.service');
    const contentTypes = this.moduleRef.get(ContentTypeService, { strict: false });

    for (const ct of users) {
      const schema = ct.schema as any[];
      const next = schema.map((f) =>
        componentOf(f) === oldName
          ? { ...f, options: { ...f.options, component: component.name, subFields: structuredClone(component.fields) } }
          : f,
      );
      if (JSON.stringify(next) === JSON.stringify(schema)) continue;
      try {
        await contentTypes.update(ct.id, { schema: next as any }, actorId);
        updatedContentTypes.push({ id: ct.id, name: ct.name });
      } catch (err) {
        errors.push(`${ct.name}: ${errorText(err)}`);
      }
    }
    return { updatedContentTypes, errors };
  }

  private allContentTypes() {
    return this.prisma.contentType.findMany({
      select: { id: true, name: true, displayName: true, schema: true },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Export / import bundle ────────────────────────────────────────────────

  /** Components for a schema export: those the given schemas use, or all of them. */
  async exportComponents(schemas?: unknown[]) {
    let where: any;
    if (schemas) {
      const names = new Set<string>();
      for (const s of schemas) if (Array.isArray(s)) for (const f of s) { const n = componentOf(f); if (n) names.add(n); }
      if (!names.size) return [];
      where = { name: { in: [...names] } };
    }
    const rows = await this.prisma.component.findMany({ where, orderBy: { name: 'asc' } });
    return rows.map((c) => ({ name: c.name, displayName: c.displayName, description: c.description, fields: c.fields }));
  }

  /**
   * Validate an import bundle's `components` without writing anything. Pushes
   * problems onto `errors` and returns the name → fields map that content type
   * schemas in the bundle should expand against (components that won't be
   * written — existing ones when `overwrite` is off — are left to the database).
   */
  async prepareImport(raw: unknown, errors: string[], overwrite = true): Promise<Map<string, any[]>> {
    const map = new Map<string, any[]>();
    if (raw === undefined || raw === null) return map;
    if (!Array.isArray(raw)) {
      errors.push('components must be an array');
      return map;
    }
    const existing = new Set((await this.prisma.component.findMany({ select: { name: true } })).map((c) => c.name));
    raw.forEach((c: any, i: number) => {
      let name = '';
      try {
        name = this.validName(c?.name);
      } catch {
        errors.push(`Component #${i + 1}: missing or invalid name`);
        return;
      }
      try {
        const fields = this.validateFields(c.fields);
        if (overwrite || !existing.has(name)) map.set(name, fields);
      } catch (err) {
        errors.push(`Component "${name}": ${errorText(err)}`);
      }
    });
    return map;
  }

  /** Write an import bundle's components (call prepareImport first). */
  async applyImport(raw: unknown, overwrite = true, actorId?: number) {
    const result = { created: 0, updated: 0, skipped: 0 };
    if (!Array.isArray(raw)) return result;
    for (const c of raw as any[]) {
      const name = normalizeComponentName(c.name);
      const existing = await this.prisma.component.findUnique({ where: { name } });
      const dto = { displayName: c.displayName ?? undefined, description: c.description ?? undefined, fields: c.fields };
      if (!existing) {
        await this.create({ name, ...dto });
        result.created++;
      } else if (overwrite) {
        await this.update(existing.id, dto, actorId);
        result.updated++;
      } else {
        result.skipped++;
      }
    }
    return result;
  }
}
