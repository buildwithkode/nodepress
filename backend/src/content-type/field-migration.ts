import { BadRequestException } from '@nestjs/common';

/**
 * Moving existing entry data along with a schema change. Entries keep every
 * field in one JSON column, so without this a renamed field's values stay
 * under the old key and a retyped field keeps values of the old type.
 *
 * Only top-level fields are migrated. Steps run in this order: renames, then
 * conversions (by the new name), then drops.
 */
export interface FieldMigrations {
  /** Move values from one top-level key to another. */
  renames?: { from: string; to: string }[];
  /** Fields (new names) whose type changed: convert each value, removing the ones that can't be. */
  convert?: string[];
  /** Fields removed from the schema whose values should be deleted too. */
  drop?: string[];
}

export interface MigrationStep {
  kind: 'rename' | 'convert' | 'drop';
  field: string;
  /** rename: the old key */
  from?: string;
  /** convert: old and new field type */
  fromType?: string;
  toType?: string;
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

/** Check the requested migrations against the old and new schema and put them in order. */
export function planMigrations(oldSchema: any[], newSchema: any[], m: FieldMigrations = {}): MigrationStep[] {
  const before = new Map(oldSchema.map((f) => [f.name, f]));
  const after = new Map(newSchema.map((f) => [f.name, f]));
  const errors: string[] = [];
  const steps: MigrationStep[] = [];
  const renamedTo = new Map<string, string>(); // new name → old name

  for (const { from, to } of m.renames ?? []) {
    if (!before.has(from)) errors.push(`Rename: "${from}" is not a field of this content type`);
    else if (after.has(from)) errors.push(`Rename: "${from}" is still in the new schema`);
    else if (!after.has(to)) errors.push(`Rename: "${to}" is not in the new schema`);
    else if (before.has(to)) errors.push(`Rename: "${to}" already exists`);
    else if (renamedTo.has(to) || [...renamedTo.values()].includes(from)) errors.push(`Rename: "${from}" → "${to}" is listed twice`);
    else {
      renamedTo.set(to, from);
      steps.push({ kind: 'rename', field: to, from });
    }
  }

  for (const name of m.convert ?? []) {
    const next = after.get(name);
    const prev = before.get(renamedTo.get(name) ?? name);
    if (!next || !prev) {
      errors.push(`Convert: "${name}" must be in both the old and the new schema`);
      continue;
    }
    const fromType = shape(prev);
    const toType = shape(next);
    if (fromType === toType) continue; // nothing to convert
    if (!conversionSql(fromType, toType)) {
      errors.push(`Convert: values can't be converted from ${fromType} to ${toType} ("${name}")`);
      continue;
    }
    steps.push({ kind: 'convert', field: name, fromType, toType });
  }

  for (const name of m.drop ?? []) {
    if (!before.has(name)) errors.push(`Drop: "${name}" is not a field of this content type`);
    else if (after.has(name)) errors.push(`Drop: "${name}" is still in the new schema`);
    else if ([...renamedTo.values()].includes(name)) errors.push(`Drop: "${name}" is being renamed`);
    else steps.push({ kind: 'drop', field: name });
  }

  if (errors.length) throw new BadRequestException({ message: 'Invalid field migrations', errors });
  return steps;
}

/** Fields whose type changed (by new name, following renames) — candidates for `convert`. */
export function retypedFields(oldSchema: any[], newSchema: any[], renames: FieldMigrations['renames'] = []) {
  const before = new Map(oldSchema.map((f) => [f.name, f]));
  const oldName = new Map(renames.map((r) => [r.to, r.from]));
  return newSchema
    .map((f) => ({ field: f.name, prev: before.get(oldName.get(f.name) ?? f.name) }))
    .filter(({ prev, field }) => prev && shape(prev) !== shape(newSchema.find((f) => f.name === field)))
    .map(({ field, prev }) => {
      const fromType = shape(prev);
      const toType = shape(newSchema.find((f) => f.name === field));
      return { field, fromType, toType, convertible: !!conversionSql(fromType, toType) };
    });
}

/** One parameterised UPDATE per step: $1 = content type id, $2 = field, $3 = old key (rename). */
export function stepSql(step: MigrationStep): string {
  switch (step.kind) {
    case 'rename':
      return `UPDATE "entries" SET "data" = ("data" - $3::text) || jsonb_build_object($2::text, "data" -> $3::text)
              WHERE "contentTypeId" = $1 AND "data" ? $3::text`;
    case 'drop':
      return `UPDATE "entries" SET "data" = "data" - $2::text WHERE "contentTypeId" = $1 AND "data" ? $2::text`;
    case 'convert': {
      const expr = conversionSql(step.fromType!, step.toType!)!;
      return `UPDATE "entries" e
              SET "data" = CASE WHEN c.nv IS NULL THEN e."data" - $2::text ELSE jsonb_set(e."data", ARRAY[$2::text], c.nv) END
              FROM (SELECT id, (${expr}) AS nv FROM (SELECT id, "data" -> $2::text AS v FROM "entries"
                    WHERE "contentTypeId" = $1 AND "data" ? $2::text) s) c
              WHERE e.id = c.id`;
    }
  }
}

/** For the impact preview: how many entries hold the field, and how many values a conversion would lose. */
export function impactSql(step: MigrationStep): string {
  const key = step.kind === 'rename' ? '$3::text' : '$2::text';
  if (step.kind !== 'convert') {
    return `SELECT count(*)::int AS entries, 0 AS lost FROM "entries" WHERE "contentTypeId" = $1 AND "data" ? ${key}`;
  }
  const expr = conversionSql(step.fromType!, step.toType!)!;
  return `SELECT count(*)::int AS entries,
                 count(*) FILTER (WHERE (${expr}) IS NULL AND jsonb_typeof(v) <> 'null')::int AS lost
          FROM (SELECT "data" -> $2::text AS v FROM "entries" WHERE "contentTypeId" = $1 AND "data" ? $2::text) s`;
}

export const stepParams = (contentTypeId: number, step: MigrationStep) =>
  step.kind === 'rename' ? [contentTypeId, step.field, step.from] : [contentTypeId, step.field];
