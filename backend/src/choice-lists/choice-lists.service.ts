import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';
import {
  Choice, applyChoices, choiceListOf, listNamesIn, mapSelectFields, normalizeChoiceListName,
  removedValuesQuery, selectsUsing, validChoiceListName, validateChoices,
} from './choice-list.util';
import { CreateChoiceListDto, UpdateChoiceListDto } from './dto/choice-list.dto';

const PUBLIC_CACHE_PREFIX = 'choice-lists:public:';
const PUBLIC_TTL_MS = 60_000;
/** Most lists one public `?names=` request may ask for. */
export const MAX_PUBLIC_NAMES = 50;

/** Content type and component fields that use a list. */
export interface ChoiceListUsage {
  contentTypes: Array<{ contentTypeId: number; contentType: string; displayName: string | null; field: string }>;
  components: Array<{ componentId: number; component: string; field: string }>;
}

/** What a public read returns — nothing an admin wrote for themselves (description). */
export interface PublicChoiceList {
  name: string;
  label: string;
  choices: Choice[];
}

const errorText = (err: any): string => {
  const res = err?.response;
  const list = Array.isArray(res?.errors) ? `: ${res.errors.join('; ')}` : '';
  return `${res?.message ?? err?.message ?? 'invalid'}${list}`;
};

/**
 * Shared choice lists for select fields (`options.choiceList`).
 *
 * Like components, a field holds a denormalized copy: expand() copies the
 * list into every select field that names it on each content type write
 * (ContentTypeService runs it after component expansion) and on each
 * component write (an operation hook — see onModuleInit). Editing a list
 * rewrites the components and content types that use it, the latter through
 * ContentTypeService.update so schema versions, caches and GraphQL follow.
 */
@Injectable()
export class ChoiceListsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Components hold select fields too. ComponentsService validates and writes
   * their fields; this hook fills in the lists they use as they are written,
   * from any code path (create, update, import, propagation).
   */
  onModuleInit() {
    this.prisma.onOperation(async (params, next) => {
      if (params.model !== 'Component' || !['create', 'update', 'upsert'].includes(params.action)) return next(params);
      const args = { ...params.args };
      for (const key of ['data', 'create', 'update'] as const) {
        if (Array.isArray(args[key]?.fields)) args[key] = { ...args[key], fields: await this.expand(args[key].fields) };
      }
      return next({ ...params, args });
    });
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async findAll() {
    const [lists, usage] = await Promise.all([
      this.prisma.choiceList.findMany({ orderBy: { name: 'asc' } }),
      this.usageSources(),
    ]);
    return lists.map((l) => ({ ...l, usage: this.usageOf(usage, l.name) }));
  }

  async findOne(id: number) {
    const list = await this.prisma.choiceList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException(`Choice list #${id} not found`);
    return { ...list, usage: this.usageOf(await this.usageSources(), list.name) };
  }

  async create(dto: CreateChoiceListDto) {
    const name = validChoiceListName(dto.name);
    const label = this.validLabel(dto.label);
    const choices = validateChoices(dto.choices);
    if (await this.prisma.choiceList.findUnique({ where: { name } })) {
      throw new ConflictException(`Choice list "${name}" already exists`);
    }
    const created = await this.prisma.choiceList.create({
      data: { name, label, description: dto.description?.trim() || null, choices: choices as any },
    });
    await this.cache.invalidatePrefix(PUBLIC_CACHE_PREFIX);
    return created;
  }

  /**
   * Update a list, then copy it into every component and content type field
   * that uses it (renaming the `choiceList` tag on a rename). When values were
   * removed, reports per field how many entries still hold one of them.
   */
  async update(id: number, dto: UpdateChoiceListDto, actorId?: number) {
    const current = await this.prisma.choiceList.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Choice list #${id} not found`);

    const data: Partial<{ name: string; label: string; description: string | null; choices: any }> = {};
    if (dto.name !== undefined) {
      const name = validChoiceListName(dto.name);
      if (name !== current.name && await this.prisma.choiceList.findUnique({ where: { name } })) {
        throw new ConflictException(`Choice list "${name}" already exists`);
      }
      data.name = name;
    }
    if (dto.label !== undefined) data.label = this.validLabel(dto.label);
    if ('description' in dto) data.description = dto.description?.trim() || null;
    if (dto.choices !== undefined) data.choices = validateChoices(dto.choices);

    const updated = await this.prisma.choiceList.update({ where: { id }, data });
    await this.cache.invalidatePrefix(PUBLIC_CACHE_PREFIX);

    const next = new Set((updated.choices as unknown as Choice[]).map((c) => c.value));
    const removed = (current.choices as unknown as Choice[]).map((c) => c.value).filter((v) => !next.has(v));
    const removedValuesInUse = removed.length ? await this.countRemovedInUse(current.name, removed) : [];

    const { updatedContentTypes, updatedComponents, errors } = await this.propagate(
      current.name, updated.name, updated.choices as unknown as Choice[], actorId,
    );
    return {
      ...updated,
      updatedContentTypes,
      updatedComponents,
      ...(removed.length ? { removedValues: removed, removedValuesInUse } : {}),
      ...(errors.length ? { propagationErrors: errors } : {}),
    };
  }

  async remove(id: number) {
    const list = await this.findOne(id);
    const where = [
      ...new Set(list.usage.contentTypes.map((u) => u.contentType)),
      ...new Set(list.usage.components.map((u) => `component ${u.component}`)),
    ];
    if (where.length) {
      throw new ConflictException(`Choice list "${list.name}" is used by ${where.join(', ')} — switch those fields to their own choices first`);
    }
    await this.prisma.choiceList.delete({ where: { id } });
    await this.cache.invalidatePrefix(PUBLIC_CACHE_PREFIX);
    return list;
  }

  private validLabel(raw: unknown): string {
    const label = typeof raw === 'string' ? raw.trim() : '';
    if (!label) throw new BadRequestException('label is required');
    if (label.length > 200) throw new BadRequestException('label must be at most 200 characters');
    return label;
  }

  // ─── Public reads (websites render the same options) ───────────────────────

  async publicOne(rawName: string): Promise<PublicChoiceList> {
    const [list] = await this.publicMany([rawName]);
    if (!list) throw new NotFoundException(`Choice list "${normalizeChoiceListName(rawName)}" not found`);
    return list;
  }

  /** The lists with these names, in the order asked; unknown names are left out. */
  async publicMany(rawNames: string[]): Promise<PublicChoiceList[]> {
    const names = [...new Set(rawNames.map(normalizeChoiceListName).filter(Boolean))];
    if (names.length > MAX_PUBLIC_NAMES) throw new BadRequestException(`Ask for at most ${MAX_PUBLIC_NAMES} lists at a time`);
    if (!names.length) return [];
    const cached = await this.cache.getMany<PublicChoiceList | null>(names.map((n) => PUBLIC_CACHE_PREFIX + n));
    const missing = names.filter((_, i) => cached[i] === undefined);
    const found = new Map<string, PublicChoiceList | null>();
    names.forEach((n, i) => { if (cached[i] !== undefined) found.set(n, cached[i] ?? null); });
    if (missing.length) {
      const rows = await this.prisma.choiceList.findMany({ where: { name: { in: missing } } });
      for (const n of missing) {
        const row = rows.find((r) => r.name === n);
        const value = row ? { name: row.name, label: row.label, choices: row.choices as unknown as Choice[] } : null;
        found.set(n, value);
        // Unknown names are cached too (as null), so a typo can't hammer the database.
        await this.cache.set(PUBLIC_CACHE_PREFIX + n, value, PUBLIC_TTL_MS);
      }
    }
    return names.map((n) => found.get(n)).filter((l): l is PublicChoiceList => !!l);
  }

  // ─── Expansion & propagation ───────────────────────────────────────────────

  /**
   * Copy the lists named by `options.choiceList` into every select field of a
   * schema (or a component's field list): top level, group/repeater subFields
   * and flexible layout fields. `overrides` (name → choices) wins over the
   * database — an import bundle's lists, validated before they are written.
   * Throws 400 for an unknown list.
   */
  async expand<T = any>(schema: T, overrides?: Map<string, Choice[]>): Promise<T> {
    if (!Array.isArray(schema)) return schema;
    const names = [...listNamesIn([schema])];
    if (!names.length) return schema;

    const lists = new Map<string, Choice[]>();
    for (const n of names) if (overrides?.has(n)) lists.set(n, overrides.get(n)!);
    const fromDb = names.filter((n) => !lists.has(n));
    if (fromDb.length) {
      const rows = await this.prisma.choiceList.findMany({ where: { name: { in: fromDb } } });
      for (const r of rows) lists.set(r.name, r.choices as unknown as Choice[]);
    }
    const missing = names.filter((n) => !lists.has(n));
    if (missing.length) {
      throw new BadRequestException(`Unknown choice list${missing.length > 1 ? 's' : ''}: ${missing.map((m) => `"${m}"`).join(', ')}`);
    }
    return mapSelectFields(schema, (f) => {
      const n = choiceListOf(f);
      return n ? applyChoices(f, n, lists.get(n)!) : f;
    }) as T;
  }

  /** Point fields that use `oldName` at `name` and copy `choices` into them. */
  private retag(schema: any[], oldName: string, name: string, choices: Choice[]): any[] {
    return mapSelectFields(schema, (f) => (choiceListOf(f) === oldName ? applyChoices(f, name, choices) : f));
  }

  private async propagate(oldName: string, name: string, choices: Choice[], actorId?: number) {
    const updatedContentTypes: Array<{ id: number; name: string }> = [];
    const updatedComponents: Array<{ id: number; name: string }> = [];
    const errors: string[] = [];
    const { contentTypes, components } = await this.usageSources();

    // Components first: content types that use them re-expand from their fields.
    for (const c of components) {
      const fields = c.fields as any[];
      if (!selectsUsing(fields, oldName).length) continue;
      const next = this.retag(fields, oldName, name, choices);
      if (JSON.stringify(next) === JSON.stringify(fields)) continue;
      await this.prisma.component.update({ where: { id: c.id }, data: { fields: next } });
      updatedComponents.push({ id: c.id, name: c.name });
    }

    const users = contentTypes.filter((ct) => selectsUsing(ct.schema, oldName).length);
    if (!users.length) return { updatedContentTypes, updatedComponents, errors };
    // Resolved lazily: ContentTypeModule imports this module.
    const { ContentTypeService } = await import('../content-type/content-type.service');
    const service = this.moduleRef.get(ContentTypeService, { strict: false });
    for (const ct of users) {
      const schema = ct.schema as any[];
      const next = this.retag(schema, oldName, name, choices);
      if (JSON.stringify(next) === JSON.stringify(schema)) continue;
      try {
        await service.update(ct.id, { schema: next as any }, actorId);
        updatedContentTypes.push({ id: ct.id, name: ct.name });
      } catch (err) {
        errors.push(`${ct.name}: ${errorText(err)}`);
      }
    }
    return { updatedContentTypes, updatedComponents, errors };
  }

  /** Per content type field using the list: live entries still holding a removed value. */
  private async countRemovedInUse(name: string, removed: string[]) {
    const out: Array<{ contentTypeId: number; contentType: string; field: string; entries: number }> = [];
    const { contentTypes } = await this.usageSources();
    for (const ct of contentTypes) {
      for (const at of selectsUsing(ct.schema, name)) {
        const sql = removedValuesQuery(at);
        if (!sql) continue;
        const [row] = await this.prisma.$queryRawUnsafe<{ n: number }[]>(sql, ct.id, removed);
        if (row?.n) out.push({ contentTypeId: ct.id, contentType: ct.name, field: at.path, entries: row.n });
      }
    }
    return out;
  }

  private async usageSources() {
    const [contentTypes, components] = await Promise.all([
      this.prisma.contentType.findMany({
        select: { id: true, name: true, displayName: true, schema: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.component.findMany({ select: { id: true, name: true, fields: true }, orderBy: { name: 'asc' } }),
    ]);
    return { contentTypes, components };
  }

  private usageOf(sources: Awaited<ReturnType<ChoiceListsService['usageSources']>>, name: string): ChoiceListUsage {
    return {
      contentTypes: sources.contentTypes.flatMap((ct) => selectsUsing(ct.schema, name).map((u) => ({
        contentTypeId: ct.id, contentType: ct.name, displayName: ct.displayName ?? null, field: u.path,
      }))),
      components: sources.components.flatMap((c) => selectsUsing(c.fields, name).map((u) => ({
        componentId: c.id, component: c.name, field: u.path,
      }))),
    };
  }

  // ─── Export / import bundle ────────────────────────────────────────────────

  /** Lists for a schema export: those the given schemas / component fields use, or all of them. */
  async exportLists(schemas?: unknown[]) {
    let where: any;
    if (schemas) {
      const names = listNamesIn(schemas);
      if (!names.size) return [];
      where = { name: { in: [...names] } };
    }
    const rows = await this.prisma.choiceList.findMany({ where, orderBy: { name: 'asc' } });
    return rows.map((l) => ({ name: l.name, label: l.label, description: l.description, choices: l.choices }));
  }

  /**
   * Validate an import bundle's `choiceLists` without writing anything. Pushes
   * problems onto `errors` and returns the name → choices map the bundle's
   * schemas expand against (lists that won't be written — existing ones when
   * `overwrite` is off — are left to the database).
   */
  async prepareImport(raw: unknown, errors: string[], overwrite = true): Promise<Map<string, Choice[]>> {
    const map = new Map<string, Choice[]>();
    if (raw === undefined || raw === null) return map;
    if (!Array.isArray(raw)) {
      errors.push('choiceLists must be an array');
      return map;
    }
    const existing = new Set((await this.prisma.choiceList.findMany({ select: { name: true } })).map((l) => l.name));
    raw.forEach((l: any, i: number) => {
      let name = '';
      try {
        name = validChoiceListName(l?.name);
      } catch {
        errors.push(`Choice list #${i + 1}: missing or invalid name`);
        return;
      }
      try {
        this.validLabel(l.label ?? name);
        const choices = validateChoices(l.choices);
        if (overwrite || !existing.has(name)) map.set(name, choices);
      } catch (err) {
        errors.push(`Choice list "${name}": ${errorText(err)}`);
      }
    });
    return map;
  }

  /**
   * Write an import bundle's lists (call prepareImport first). An updated list
   * propagates like any edit, so types outside the bundle stay in step.
   */
  async applyImport(raw: unknown, overwrite = true, actorId?: number) {
    const result = { created: 0, updated: 0, skipped: 0 };
    if (!Array.isArray(raw)) return result;
    for (const l of raw as any[]) {
      const name = normalizeChoiceListName(l.name);
      const existing = await this.prisma.choiceList.findUnique({ where: { name } });
      const dto = { label: l.label ?? name, description: l.description ?? undefined, choices: l.choices };
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
