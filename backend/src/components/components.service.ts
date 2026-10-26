import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { FieldMigrations } from '../content-type/field-migration';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { SchemaValidator } from '../fields/schema.validator';
import { normalizeKey, normalizeSchemaNames } from '../common/normalize';
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

const nameIn = (c: unknown): string | null =>
  typeof c === 'string' && c.trim() ? normalizeComponentName(c) : null;

/** A top-level field inserted inline (seamless) from a component: `component: "<name>"` on the field itself. */
export const inlineComponentOf = (field: any): string | null => nameIn(field?.component);

/** A flexible layout whose fields come from a component: `{ name, label, component, fields }`. */
export const layoutComponentOf = (layout: any): string | null => nameIn(layout?.component);

export type ComponentUseType = 'group' | 'repeater' | 'inline' | 'layout';

/** One place a schema uses a component. */
export interface ComponentUse {
  component: string;
  type: ComponentUseType;
  /** group/repeater: the field; inline: the first inserted field; layout: the flexible field */
  field: string;
  /** layout: the layout's name */
  layout?: string;
  /** inline: the inserted fields */
  fields?: string[];
}

/** Every use of a component in a schema, in schema order. */
export function componentUses(schema: unknown): ComponentUse[] {
  const out: ComponentUse[] = [];
  if (!Array.isArray(schema)) return out;
  schema.forEach((f: any, i: number) => {
    const inline = inlineComponentOf(f);
    if (inline) {
      // A contiguous run of fields tagged with the same component is one use.
      const prev = out[out.length - 1];
      if (i > 0 && inlineComponentOf(schema[i - 1]) === inline && prev?.type === 'inline') prev.fields!.push(f.name);
      else out.push({ component: inline, type: 'inline', field: f.name, fields: [f.name] });
      return;
    }
    const c = componentOf(f);
    if (c) out.push({ component: c, type: f.type, field: f.name });
    if (f?.type === 'flexible' && Array.isArray(f.options?.layouts)) {
      for (const l of f.options.layouts) {
        const lc = layoutComponentOf(l);
        if (lc) out.push({ component: lc, type: 'layout', field: f.name, layout: l.name || lc });
      }
    }
  });
  return out;
}

/** Where a component's field `name` lives in entry data for one use (a field-migration path). */
const pathIn = (use: ComponentUse, name: string): string =>
  use.type === 'inline' ? name : use.type === 'layout' ? `${use.field}.${use.layout}.${name}` : `${use.field}.${name}`;

/** Point every use of component `from` at `to` (a component rename). */
function renameUses(schema: any[], from: string, to: string): any[] {
  return schema.map((f) => {
    if (inlineComponentOf(f) === from) return { ...f, component: to };
    if (componentOf(f) === from) return { ...f, options: { ...f.options, component: to } };
    if (f?.type === 'flexible' && Array.isArray(f.options?.layouts)) {
      const layouts = f.options.layouts.map((l: any) => (layoutComponentOf(l) === from ? { ...l, component: to } : l));
      return { ...f, options: { ...f.options, layouts } };
    }
    return f;
  });
}

/** Content type fields that use a component. */
export interface ComponentUsage {
  contentTypeId: number;
  contentType: string;
  displayName: string | null;
  field: string;
  type: ComponentUseType;
  layout?: string;
  fields?: string[];
}

function usageIn(
  contentTypes: Array<{ id: number; name: string; displayName?: string | null; schema: unknown }>,
  name: string,
): ComponentUsage[] {
  const out: ComponentUsage[] = [];
  for (const ct of contentTypes) {
    for (const { component, ...use } of componentUses(ct.schema)) {
      if (component === name) out.push({ contentTypeId: ct.id, contentType: ct.name, displayName: ct.displayName ?? null, ...use });
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
 * Reusable components — a named list of fields (repeaters, groups and
 * flexible fields included, nested up to MAX_NESTING levels counting the
 * container that uses the component) that content types use in four ways:
 *  - a group field (one) or a repeater field (many) with `options.component`;
 *  - inline (seamless): the fields themselves, at top level, each tagged
 *    `component: "<name>"` — entry data stays flat;
 *  - a flexible layout `{ name, label, component, fields }`.
 *
 * The fields a content type holds are a denormalized copy of the component's:
 * expand() fills them in on every content type write, and updating a
 * component rewrites every content type that uses it through
 * ContentTypeService.update (schema versions, caches, GraphQL, field indexes).
 * Everything that reads schemas (DataValidator, GraphQL, type generator, the
 * admin entry form) sees ordinary fields.
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
    const fields = normalizeSchemaNames(raw);
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
    const { updatedContentTypes, errors } = await this.propagate(current.name, updated, actorId, dto.fieldMigrations);
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
   * Fill in the fields of every use of a component from that component:
   * `options.subFields` of group/repeater fields, the `fields` of component
   * layouts (name and label default to the component's), and each contiguous
   * run of top-level fields tagged with the same component (replaced, at the
   * run's first position, by fresh tagged copies). `overrides` (name → fields)
   * wins over the database — an import bundle's components, validated before
   * they are written. Throws 400 for an unknown component, a component used
   * inline twice, or an inline field whose name is taken.
   */
  async expand<T = any>(schema: T, overrides?: Map<string, any[]>): Promise<T> {
    if (!Array.isArray(schema)) return schema;
    const names = [...new Set(componentUses(schema).map((u) => u.component))];
    if (!names.length) return schema;

    const found = new Map<string, { fields: any[]; displayName?: string | null }>();
    for (const n of names) if (overrides?.has(n)) found.set(n, { fields: overrides.get(n)! });
    const fromDb = names.filter((n) => !found.has(n));
    if (fromDb.length) {
      const rows = await this.prisma.component.findMany({ where: { name: { in: fromDb } } });
      for (const r of rows) found.set(r.name, { fields: r.fields as any[], displayName: r.displayName });
    }
    const missing = names.filter((n) => !found.has(n));
    if (missing.length) {
      throw new BadRequestException(`Unknown component${missing.length > 1 ? 's' : ''}: ${missing.map((m) => `"${m}"`).join(', ')}`);
    }
    const fieldsOf = (n: string): any[] => structuredClone(found.get(n)!.fields);

    const out: any[] = [];
    const inlined = new Set<string>();
    schema.forEach((f: any, i: number) => {
      const inline = inlineComponentOf(f);
      if (inline) {
        if (i > 0 && inlineComponentOf(schema[i - 1]) === inline) return; // rest of the run
        if (inlined.has(inline)) {
          throw new BadRequestException(`Component "${inline}" is used inline more than once — a content type can include its fields only once`);
        }
        inlined.add(inline);
        out.push(...fieldsOf(inline).map((cf) => ({ ...cf, component: inline })));
        return;
      }
      const n = componentOf(f);
      if (n) {
        out.push({ ...f, options: { ...f.options, component: n, subFields: fieldsOf(n) } });
        return;
      }
      if (f?.type === 'flexible' && Array.isArray(f.options?.layouts) && f.options.layouts.some(layoutComponentOf)) {
        const layouts = f.options.layouts.map((l: any) => {
          const ln = layoutComponentOf(l);
          if (!ln) return l;
          const label = l.label || found.get(ln)!.displayName;
          return { ...l, name: l.name || ln, ...(label ? { label } : {}), component: ln, fields: fieldsOf(ln) };
        });
        out.push({ ...f, options: { ...f.options, layouts } });
        return;
      }
      out.push(f);
    });

    // An inline component's fields share the content type's top level.
    const seen = new Map<string, any>();
    out.forEach((f, i) => {
      if (typeof f?.name !== 'string') return;
      const key = normalizeKey(f.name);
      const prev = seen.get(key);
      const from = inlineComponentOf(f) ?? (prev && inlineComponentOf(prev));
      if (prev && from) {
        throw new BadRequestException({
          message: 'Invalid schema',
          errors: [`schema[${i}].name "${key}": duplicate field name — "${key}" is a field of component "${from}", used inline`],
        });
      }
      seen.set(key, f);
    });
    return out as T;
  }

  private async propagate(
    oldName: string,
    component: { name: string; fields: unknown },
    actorId?: number,
    migrations?: FieldMigrations,
  ): Promise<{ updatedContentTypes: Array<{ id: number; name: string }>; errors: string[] }> {
    const updatedContentTypes: Array<{ id: number; name: string }> = [];
    const errors: string[] = [];
    const users = (await this.allContentTypes()).filter((ct) => usageIn([ct], oldName).length);
    if (!users.length) return { updatedContentTypes, errors };

    // Resolved lazily: ContentTypeModule imports this module, so a static
    // import of ContentTypeService here would be a cycle.
    const { ContentTypeService } = await import('../content-type/content-type.service');
    const contentTypes = this.moduleRef.get(ContentTypeService, { strict: false });
    const overrides = new Map([[component.name, component.fields as any[]]]);

    for (const ct of users) {
      const schema = ct.schema as any[];
      try {
        const next = await this.expand(oldName === component.name ? schema : renameUses(schema, oldName, component.name), overrides);
        if (JSON.stringify(next) === JSON.stringify(schema)) continue;
        // The component's field names become paths in each place that uses it:
        // `name` inline, `field.name` in a group/repeater, `field.layout.name` in a layout.
        const uses = componentUses(schema).filter((u) => u.component === oldName);
        const at = (name: string) => uses.map((u) => pathIn(u, name));
        const fieldMigrations = migrations && {
          renames: (migrations.renames ?? []).flatMap((r) => uses.map((u) => ({ from: pathIn(u, r.from), to: pathIn(u, r.to) }))),
          convert: (migrations.convert ?? []).flatMap(at),
          drop: (migrations.drop ?? []).flatMap(at),
        };
        await contentTypes.update(ct.id, { schema: next as any, ...(fieldMigrations ? { fieldMigrations } : {}) }, actorId);
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
      for (const s of schemas) for (const u of componentUses(s)) names.add(u.component);
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
