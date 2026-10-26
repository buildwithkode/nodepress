import { BadRequestException } from '@nestjs/common';

/**
 * Moving existing entry data along with a schema change. Entries keep every
 * field in one JSON column, so without this a renamed field's values stay
 * under the old key and a retyped field keeps values of the old type.
 *
 * A field is named by its path: `title` (top level), `seo.meta_title` (a
 * group or repeater sub-field, in every row) or `blocks.hero.heading` (a
 * field of one flexible layout) — and so on down nested containers:
 * `blocks.hero.buttons.label` is the `label` of every row of the `buttons`
 * repeater inside the `hero` layout. Nested paths use the containers' new names.
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

/** One container on the way to a nested field: its key, its type and (flexible) the layout. */
export interface Hop {
  type: Container;
  key: string;
  layout?: string;
}

export interface MigrationStep {
  kind: 'rename' | 'convert' | 'drop';
  /** Path of the field (its new path for renames and conversions) */
  field: string;
  /** rename: the old path */
  from?: string;
  /** convert: old and new field type */
  fromType?: string;
  toType?: string;
  /** The innermost container of a nested field — absent for top-level fields */
  container?: Container;
  /** Every container from the top down to the field — absent for top-level fields */
  hops?: Hop[];
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
  hops: Hop[];
}

const split = (path: string) => path.split('.');
const parentOf = (path: string) => split(path).slice(0, -1).join('.');
const leafOf = (path: string) => split(path).pop()!;

/**
 * Find a field by path in a schema, or null when the path can't exist there.
 * Each group or repeater on the way takes one segment (its name), each
 * flexible field two (its name, then the layout's).
 */
function locate(schema: any[], path: string): Slot | null {
  const parts = split(path);
  let fields = schema;
  const hops: Hop[] = [];
  for (let i = 0; ; ) {
    const name = parts[i];
    if (i === parts.length - 1) {
      return { fields, field: fields.find((f) => f?.name === name), hops, container: hops[hops.length - 1]?.type };
    }
    const parent = fields.find((f) => f?.name === name);
    if (parent?.type === 'group' || parent?.type === 'repeater') {
      hops.push({ type: parent.type, key: name });
      fields = parent.options?.subFields ?? [];
      i += 1;
    } else if (parent?.type === 'flexible' && i + 2 < parts.length) {
      const layout = (parent.options?.layouts ?? []).find((l: any) => l?.name === parts[i + 1]);
      if (!layout) return null;
      hops.push({ type: 'flexible', key: name, layout: parts[i + 1] });
      fields = layout.fields ?? [];
      i += 2;
    } else {
      return null;
    }
  }
}

/** Every field path in a schema, at every depth of groups, repeaters and layouts. */
function allPaths(schema: any[], prefix = ''): string[] {
  const out: string[] = [];
  for (const f of schema ?? []) {
    const path = `${prefix}${f.name}`;
    out.push(path);
    if (f.type === 'group' || f.type === 'repeater') out.push(...allPaths(f.options?.subFields, `${path}.`));
    if (f.type === 'flexible') for (const l of f.options?.layouts ?? []) out.push(...allPaths(l.fields, `${path}.${l.name}.`));
  }
  return out;
}

/**
 * Where a field was in the old schema. Renames name both paths with the
 * containers' new names, so each segment is mapped back on its own: a rename
 * whose `to` is the path so far gives that segment's old name.
 */
function oldPathOf(path: string, renames: { from: string; to: string }[]): string {
  const parts = split(path);
  return parts
    .map((part, i) => {
      const r = renames.find((x) => x.to === parts.slice(0, i + 1).join('.'));
      return r ? leafOf(r.from) : part;
    })
    .join('.');
}

/** The reverse: where an old path is in the new schema (each segment followed through its rename). */
function newPathOf(oldPath: string, renames: { from: string; to: string }[]): string {
  const parts = split(oldPath);
  const out: string[] = [];
  parts.forEach((part) => {
    const r = renames.find((x) => x.from === [...out, part].join('.'));
    out.push(r ? leafOf(r.to) : part);
  });
  return out.join('.');
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

  const nestedAt = (slot: Slot | null) => (slot?.hops.length ? { container: slot.container, hops: slot.hops } : {});
  const steps: MigrationStep[] = renames.map(({ from, to }) => ({
    kind: 'rename', field: to, from, ...nestedAt(locate(newSchema, to)),
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
    steps.push({ kind: 'convert', field: path, fromType, toType, ...nestedAt(next) });
  }

  for (const path of m.drop ?? []) {
    const nested = path.includes('.');
    const prev = locate(oldSchema, nested ? oldPathOf(path, renames) : path);
    const next = locate(newSchema, path);
    if (!prev?.field) errors.push(`Drop: "${path}" is not a field of this content type`);
    else if (next?.field) errors.push(`Drop: "${path}" is still in the new schema`);
    else if (renames.some((r) => r.from === path)) errors.push(`Drop: "${path}" is being renamed`);
    else if (nested && !next) errors.push(`Drop: the container of "${path}" is not in the new schema — drop the container instead`);
    else steps.push({ kind: 'drop', field: path, ...nestedAt(next) });
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
  const list = renames ?? [];
  const renamedFrom = new Set(list.map((r) => r.from));
  return allPaths(oldSchema)
    .filter((p) => p.includes('.'))
    // The containers' new names with the field's old name — the form renames and drops use.
    .map((p) => [parentOf(newPathOf(p, list)), leafOf(p)].join('.'))
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
    const at = this.values.indexOf(value, 1);
    if (at > 0) return `$${at + 1}::text`;
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

/** The containers of a nested step (older callers pass only `container`, for one level). */
function hopsOf(step: MigrationStep): Hop[] {
  if (step.hops?.length) return step.hops;
  if (!step.container) return [];
  const parts = split(step.field);
  return [{ type: step.container, key: parts[0], ...(step.container === 'flexible' ? { layout: parts[1] } : {}) }];
}

/**
 * SQL rebuilding the jsonb object `o` with the step applied inside the
 * containers `hops`: a group is replaced in place, every row of a repeater
 * (every block of the layout, for a flexible field) is rebuilt in order.
 * Anything not shaped as expected is left alone.
 */
function nestedTransform(step: MigrationStep, o: string, hops: Hop[], p: Params, depth = 1): string {
  if (!hops.length) return transform(step, o, p);
  const [hop, ...rest] = hops;
  const key = p.text(hop.key);
  if (hop.type === 'group') {
    return `CASE WHEN jsonb_typeof(${o} -> ${key}) = 'object' THEN jsonb_set(${o}, ARRAY[${key}], ${nestedTransform(step, `(${o} -> ${key})`, rest, p, depth + 1)}) ELSE ${o} END`;
  }
  const t = `t${depth}`;
  const match = hop.type === 'flexible'
    ? `jsonb_typeof(${t}.el) = 'object' AND ${t}.el ->> '_layout' = ${p.text(hop.layout!)}`
    : `jsonb_typeof(${t}.el) = 'object'`;
  const row = nestedTransform(step, `${t}.el`, rest, p, depth + 1);
  return `CASE WHEN jsonb_typeof(${o} -> ${key}) = 'array' AND jsonb_array_length(${o} -> ${key}) > 0 THEN jsonb_set(${o}, ARRAY[${key}], (
            SELECT jsonb_agg(CASE WHEN ${match} THEN ${row} ELSE ${t}.el END ORDER BY ${t}.ord)
            FROM jsonb_array_elements(${o} -> ${key}) WITH ORDINALITY AS ${t}(el, ord)
          )) ELSE ${o} END`;
}

/** One parameterised UPDATE for a step. */
export function stepQuery(contentTypeId: number, step: MigrationStep): { sql: string; params: unknown[] } {
  const p = new Params(contentTypeId);
  const hops = hopsOf(step);
  if (!hops.length) {
    const t = transform(step, `"data"`, p);
    return { sql: `UPDATE "entries" SET "data" = ${t} WHERE "contentTypeId" = $1 AND "data" ? ${p.text(touchedKey(step))}`, params: p.values };
  }
  const t = nestedTransform(step, `"data"`, hops, p);
  const top = p.text(hops[0].key);
  return {
    sql: `UPDATE "entries" SET "data" = ${t}
          WHERE "contentTypeId" = $1 AND jsonb_typeof("data" -> ${top}) IN ('object', 'array')`,
    params: p.values,
  };
}

/** SQL selecting, as `o`, every object a nested step touches (one row per group / repeater row / block). */
function objectsAt(hops: Hop[], p: Params): string {
  let from = `SELECT e."data" AS o`;
  hops.forEach((hop, i) => {
    const x = `x${i}`;
    const key = p.text(hop.key);
    from = hop.type === 'group'
      ? `SELECT ${x}.o -> ${key} AS o FROM (${from}) ${x} WHERE jsonb_typeof(${x}.o -> ${key}) = 'object'`
      : `SELECT el AS o FROM (${from}) ${x}
           CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(${x}.o -> ${key}) = 'array' THEN ${x}.o -> ${key} ELSE '[]'::jsonb END) el
           WHERE jsonb_typeof(el) = 'object'${hop.type === 'flexible' ? ` AND el ->> '_layout' = ${p.text(hop.layout!)}` : ''}`;
  });
  return from;
}

/** For the impact preview: how many entries hold the field, and how many values a conversion would lose. */
export function impactQuery(contentTypeId: number, step: MigrationStep): { sql: string; params: unknown[] } {
  const p = new Params(contentTypeId);
  const objects = objectsAt(hopsOf(step), p);
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
