import { BadRequestException } from '@nestjs/common';

/**
 * Moving existing entry data along with a schema change. Entries keep every
 * field in one JSON column, so without this a renamed field's values stay
 * under the old key and a retyped field keeps values of the old type.
 *
 * A field is named by its path: `title` (top level), `seo.meta_title` (a
 * group or repeater sub-field, in every row) or `blocks.hero.heading` (a
 * field of one flexible layout). Nested paths use the container's new name.
 * Steps run in this order: top-level renames, nested renames, conversions
 * (by the new path), then drops.
 */
export interface FieldMigrations {
  /** Move values from one key to another in the same container. */
  renames?: { from: string; to: string }[];
  /** Fields (new paths) whose type changed: convert each value, removing the ones that can't be. */
  convert?: string[];
  /** Fields removed from the schema whose values should be deleted too. */
  drop?: string[];
}

export type Container = 'group' | 'repeater' | 'flexible';

export interface MigrationStep {
  kind: 'rename' | 'convert' | 'drop';
  /** Path of the field (its new path for renames and conversions) */
  field: string;
  /** rename: the old path */
  from?: string;
  /** convert: old and new field type */
  fromType?: string;
  toType?: string;
  /** Where nested fields live — absent for top-level fields */
  container?: Container;
}

const STRING_TYPES = new Set(['text', 'textarea', 'richtext', 'color', 'date', 'datetime']);

/** A select is "single" or "multiple" depending on its options. */
const shape = (field: any): string =>
  field?.type === 'select' ? (field.options?.multiple ? 'select[]' : 'select') : field?.type;

/**
 * SQL expression turning the jsonb value `v` of a `from`-type field into a
 * `to`-type value, or NULL when it can't be converted (the key is then removed).
 * Returns null when there is no conversion between the two types.
 */
export function conversionSql(from: string, to: string): string | null {
  const text = `(v #>> '{}')`;
  const scalarText = `CASE WHEN jsonb_typeof(v) IN ('string','number','boolean') THEN ${text} END`;
  const stripHtml = `btrim(regexp_replace(regexp_replace(${text}, '<[^>]+>', ' ', 'g'), '\\s+', ' ', 'g'))`;
  const escapeHtml = `replace(replace(replace(${text}, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')`;

  if (from === to) return null;
  const toString = STRING_TYPES.has(to) || to === 'select';
  const fromString = STRING_TYPES.has(from) || from === 'select';

  if (to === 'json') return 'v';
  if (to === 'richtext' && fromString) {
    return `CASE WHEN jsonb_typeof(v) = 'string' THEN to_jsonb('<p>' || ${escapeHtml} || '</p>') END`;
  }
  if (from === 'richtext' && toString) {
    return `CASE WHEN jsonb_typeof(v) = 'string' THEN to_jsonb(${stripHtml}) END`;
  }
  if (toString && (fromString || from === 'number' || from === 'boolean')) {
    return `CASE WHEN ${scalarText} IS NOT NULL THEN to_jsonb(${scalarText}) END`;
  }
  if (toString && from === 'select[]') {
    return `CASE WHEN jsonb_typeof(v) = 'array' AND jsonb_array_length(v) > 0 THEN v -> 0 END`;
  }
  if (to === 'select[]' && (fromString || from === 'number')) {
    return `CASE WHEN ${scalarText} IS NOT NULL THEN jsonb_build_array(${scalarText}) END`;
  }
  if (to === 'number' && (fromString || from === 'boolean')) {
    return `CASE
      WHEN jsonb_typeof(v) = 'number' THEN v
      WHEN jsonb_typeof(v) = 'string' AND btrim(${text}) ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN to_jsonb(btrim(${text})::numeric)
    END`;
  }
  if (to === 'boolean' && (fromString || from === 'number')) {
    return `CASE
      WHEN jsonb_typeof(v) = 'boolean' THEN v
      WHEN lower(btrim(${scalarText})) IN ('true','yes','1','on') THEN 'true'::jsonb
      WHEN lower(btrim(${scalarText})) IN ('false','no','0','off') THEN 'false'::jsonb
    END`;
  }
  return null;
}

// ─── Paths ────────────────────────────────────────────────────────────────────

interface Slot {
  /** The fields next to this one */
  fields: any[];
  /** The field itself (undefined when it doesn't exist) */
  field: any;
  container?: Container;
}

const split = (path: string) => path.split('.');
const parentOf = (path: string) => split(path).slice(0, -1).join('.');
const leafOf = (path: string) => split(path).pop()!;

/** Find a field by path in a schema, or null when the path can't exist there. */
function locate(schema: any[], path: string): Slot | null {
  const parts = split(path);
  if (parts.length === 1) return { fields: schema, field: schema.find((f) => f?.name === parts[0]) };
  const parent = schema.find((f) => f?.name === parts[0]);
  if (!parent) return null;
  if (parts.length === 2 && (parent.type === 'group' || parent.type === 'repeater')) {
    const fields = parent.options?.subFields ?? [];
    return { fields, field: fields.find((f: any) => f?.name === parts[1]), container: parent.type };
  }
  if (parts.length === 3 && parent.type === 'flexible') {
    const layout = (parent.options?.layouts ?? []).find((l: any) => l?.name === parts[1]);
    if (!layout) return null;
    return { fields: layout.fields ?? [], field: (layout.fields ?? []).find((f: any) => f?.name === parts[2]), container: 'flexible' };
  }
  return null;
}

/** Every field path in a schema: top-level fields and the fields inside groups, repeaters and layouts. */
function allPaths(schema: any[]): string[] {
  const out: string[] = [];
  for (const f of schema) {
    out.push(f.name);
    if (f.type === 'group' || f.type === 'repeater') for (const sf of f.options?.subFields ?? []) out.push(`${f.name}.${sf.name}`);
    if (f.type === 'flexible') {
      for (const l of f.options?.layouts ?? []) for (const lf of l.fields ?? []) out.push(`${f.name}.${l.name}.${lf.name}`);
    }
  }
  return out;
}

/** Where a field was in the old schema, following top-level and nested renames. */
function oldPathOf(path: string, renames: { from: string; to: string }[]): string {
  const direct = renames.find((r) => r.to === path);
  if (direct) return direct.from;
  const parts = split(path);
  if (parts.length === 1) return path;
  const top = renames.find((r) => !r.to.includes('.') && r.to === parts[0]);
  return top ? [top.from, ...parts.slice(1)].join('.') : path;
}

// ─── Planning ─────────────────────────────────────────────────────────────────

/** Check the requested migrations against the old and new schema and put them in order. */
export function planMigrations(oldSchema: any[], newSchema: any[], m: FieldMigrations = {}): MigrationStep[] {
  const errors: string[] = [];
  const renames: { from: string; to: string }[] = [];
  // Top-level renames move whole containers, so they go first.
  const requested = [...(m.renames ?? [])].sort((a, b) => split(a.to).length - split(b.to).length);

  for (const { from, to } of requested) {
    const nested = to.includes('.');
    // A nested rename stays in its container, named by its new name in both paths.
    if (split(from).length !== split(to).length || parentOf(to) !== parentOf(from)) {
      errors.push(`Rename: "${from}" → "${to}" must stay in the same group, repeater or layout`);
      continue;
    }
    const oldFrom = nested ? oldPathOf(from, renames) : from;
    const prev = locate(oldSchema, oldFrom);
    const next = locate(newSchema, to);
    const stillThere = locate(newSchema, from);
    const takenBefore = locate(oldSchema, nested ? oldPathOf(to, renames) : to);
    if (!prev?.field) errors.push(`Rename: "${from}" is not a field of this content type`);
    else if (stillThere?.field) errors.push(`Rename: "${from}" is still in the new schema`);
    else if (!next?.field) errors.push(`Rename: "${to}" is not in the new schema`);
    else if (takenBefore?.field) errors.push(`Rename: "${to}" already exists`);
    else if (renames.some((r) => r.to === to || r.from === from)) errors.push(`Rename: "${from}" → "${to}" is listed twice`);
    else renames.push({ from, to });
  }

  const steps: MigrationStep[] = renames.map(({ from, to }) => ({
    kind: 'rename', field: to, from, ...(to.includes('.') ? { container: locate(newSchema, to)!.container } : {}),
  }));

  for (const path of m.convert ?? []) {
    const next = locate(newSchema, path);
    const prev = locate(oldSchema, oldPathOf(path, renames));
    if (!next?.field || !prev?.field) {
      errors.push(`Convert: "${path}" must be in both the old and the new schema`);
      continue;
    }
    const fromType = shape(prev.field);
    const toType = shape(next.field);
    if (fromType === toType) continue; // nothing to convert
    if (!conversionSql(fromType, toType)) {
      errors.push(`Convert: values can't be converted from ${fromType} to ${toType} ("${path}")`);
      continue;
    }
    steps.push({ kind: 'convert', field: path, fromType, toType, ...(next.container ? { container: next.container } : {}) });
  }

  for (const path of m.drop ?? []) {
    const nested = path.includes('.');
    const prev = locate(oldSchema, nested ? oldPathOf(path, renames) : path);
    const next = locate(newSchema, path);
    if (!prev?.field) errors.push(`Drop: "${path}" is not a field of this content type`);
    else if (next?.field) errors.push(`Drop: "${path}" is still in the new schema`);
    else if (renames.some((r) => r.from === path)) errors.push(`Drop: "${path}" is being renamed`);
    else if (nested && !next) errors.push(`Drop: the container of "${path}" is not in the new schema — drop the container instead`);
    else steps.push({ kind: 'drop', field: path, ...(nested ? { container: next!.container } : {}) });
  }

  if (errors.length) throw new BadRequestException({ message: 'Invalid field migrations', errors });
  return steps;
}

/** Fields (paths, following renames) whose type changed — candidates for `convert`. */
export function retypedFields(oldSchema: any[], newSchema: any[], renames: FieldMigrations['renames'] = []) {
  const out: { field: string; fromType: string; toType: string; convertible: boolean }[] = [];
  for (const path of allPaths(newSchema)) {
    const prev = locate(oldSchema, oldPathOf(path, renames));
    const next = locate(newSchema, path);
    if (!prev?.field || !next?.field) continue;
    const fromType = shape(prev.field);
    const toType = shape(next.field);
    if (fromType !== toType) out.push({ field: path, fromType, toType, convertible: !!conversionSql(fromType, toType) });
  }
  return out;
}

/** Nested fields that exist in the old schema but not the new one (their container still exists). */
export function removedNestedFields(oldSchema: any[], newSchema: any[], renames: FieldMigrations['renames'] = []) {
  const renamedFrom = new Set((renames ?? []).map((r) => r.from));
  const topRename = new Map((renames ?? []).filter((r) => !r.to.includes('.')).map((r) => [r.from, r.to]));
  return allPaths(oldSchema)
    .filter((p) => p.includes('.'))
    .map((p) => {
      const parts = split(p);
      return [topRename.get(parts[0]) ?? parts[0], ...parts.slice(1)].join('.');
    })
    .filter((p) => {
      const slot = locate(newSchema, p);
      return slot && !slot.field && !renamedFrom.has(p);
    });
}

// ─── SQL ──────────────────────────────────────────────────────────────────────

/** Numbered parameters, added as they are used ($1 is always the content type id). */
class Params {
  readonly values: unknown[];
  constructor(contentTypeId: number) {
    this.values = [contentTypeId];
  }
  text(value: string) {
    this.values.push(value);
    return `$${this.values.length}::text`;
  }
}

/** SQL turning the jsonb object `o` into its migrated form for one step. */
function transform(step: MigrationStep, o: string, p: Params): string {
  const key = p.text(leafOf(step.field));
  switch (step.kind) {
    case 'rename': {
      const from = p.text(leafOf(step.from!));
      return `CASE WHEN jsonb_typeof(${o}) = 'object' AND ${o} ? ${from} THEN (${o} - ${from}) || jsonb_build_object(${key}, ${o} -> ${from}) ELSE ${o} END`;
    }
    case 'drop':
      return `CASE WHEN jsonb_typeof(${o}) = 'object' THEN ${o} - ${key} ELSE ${o} END`;
    case 'convert': {
      const expr = conversionSql(step.fromType!, step.toType!)!;
      return `CASE WHEN jsonb_typeof(${o}) = 'object' AND ${o} ? ${key} THEN (
                SELECT CASE WHEN (${expr}) IS NULL THEN ${o} - ${key} ELSE jsonb_set(${o}, ARRAY[${key}], (${expr})) END
                FROM (SELECT ${o} -> ${key} AS v) x
              ) ELSE ${o} END`;
    }
  }
}

/** The key whose presence marks an object the step touches. */
const touchedKey = (step: MigrationStep) => leafOf(step.kind === 'rename' ? step.from! : step.field);

/** One parameterised UPDATE for a step. */
export function stepQuery(contentTypeId: number, step: MigrationStep): { sql: string; params: unknown[] } {
  const p = new Params(contentTypeId);
  const parts = split(step.field);
  if (!step.container) {
    const t = transform(step, `"data"`, p);
    return { sql: `UPDATE "entries" SET "data" = ${t} WHERE "contentTypeId" = $1 AND "data" ? ${p.text(touchedKey(step))}`, params: p.values };
  }
  const parent = p.text(parts[0]);
  if (step.container === 'group') {
    const t = transform(step, `("data" -> ${parent})`, p);
    return {
      sql: `UPDATE "entries" SET "data" = jsonb_set("data", ARRAY[${parent}], ${t})
            WHERE "contentTypeId" = $1 AND jsonb_typeof("data" -> ${parent}) = 'object'`,
      params: p.values,
    };
  }
  const layout = step.container === 'flexible' ? `t.el ->> '_layout' = ${p.text(parts[1])}` : 'true';
  const t = transform(step, 't.el', p);
  return {
    sql: `UPDATE "entries" SET "data" = jsonb_set("data", ARRAY[${parent}], (
            SELECT jsonb_agg(CASE WHEN ${layout} THEN ${t} ELSE t.el END ORDER BY t.ord)
            FROM jsonb_array_elements("data" -> ${parent}) WITH ORDINALITY AS t(el, ord)
          ))
          WHERE "contentTypeId" = $1 AND jsonb_typeof("data" -> ${parent}) = 'array' AND jsonb_array_length("data" -> ${parent}) > 0`,
    params: p.values,
  };
}

/** For the impact preview: how many entries hold the field, and how many values a conversion would lose. */
export function impactQuery(contentTypeId: number, step: MigrationStep): { sql: string; params: unknown[] } {
  const p = new Params(contentTypeId);
  const parts = split(step.field);
  let objects: string;
  if (!step.container) objects = `SELECT e."data" AS o`;
  else {
    const parent = p.text(parts[0]);
    objects = step.container === 'group'
      ? `SELECT e."data" -> ${parent} AS o WHERE jsonb_typeof(e."data" -> ${parent}) = 'object'`
      : `SELECT el AS o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e."data" -> ${parent}) = 'array' THEN e."data" -> ${parent} ELSE '[]'::jsonb END) el
         WHERE jsonb_typeof(el) = 'object'${step.container === 'flexible' ? ` AND el ->> '_layout' = ${p.text(parts[1])}` : ''}`;
  }
  const key = p.text(touchedKey(step));
  const lost = step.kind === 'convert'
    ? `count(*) FILTER (WHERE x.o ? ${key} AND jsonb_typeof(x.o -> ${key}) <> 'null'
         AND (SELECT (${conversionSql(step.fromType!, step.toType!)}) FROM (SELECT x.o -> ${key} AS v) y) IS NULL)::int`
    : '0';
  return {
    sql: `SELECT count(DISTINCT e.id) FILTER (WHERE x.o ? ${key})::int AS entries, ${lost} AS lost
          FROM "entries" e CROSS JOIN LATERAL (${objects}) x
          WHERE e."contentTypeId" = $1`,
    params: p.values,
  };
}
