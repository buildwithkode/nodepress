import { BadRequestException } from '@nestjs/common';

/**
 * Shared choice lists for select fields — pure helpers (no database).
 *
 * A select field opts in with `options.choiceList: "<name>"`. On save the
 * list is copied into the field: values → `options.choices`, labels that
 * differ from the value → `options.choiceLabels`. Everything that reads
 * schemas (DataValidator, GraphQL, OpenAPI, type generation) only sees an
 * ordinary select field.
 */

export interface Choice {
  value: string;
  label?: string;
}

export const MAX_CHOICES = 1000;
export const MAX_VALUE_LENGTH = 200;

const NAME_RE = /^[a-z_][a-z0-9_]*$/;

export const normalizeChoiceListName = (name: string): string =>
  name.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** The (normalized) choice list a select field uses, or null. */
export function choiceListOf(field: any): string | null {
  if (!field || field.type !== 'select') return null;
  const n = field.options?.choiceList;
  return typeof n === 'string' && n.trim() ? normalizeChoiceListName(n) : null;
}

/** Where a select field sits in a schema: top level, or inside a group/repeater/flexible layout. */
export interface SelectPath {
  /** Display path: `size`, `seo.size`, `items.size`, `blocks[hero].size` */
  path: string;
  field: string;
  container?: { name: string; type: 'group' | 'repeater' | 'flexible'; layout?: string };
}

/**
 * Rewrite every select field of a schema (top level, group/repeater subFields,
 * flexible layout fields) through `fn`. Unchanged parts keep their identity.
 */
export function mapSelectFields(schema: any[], fn: (field: any, at: SelectPath) => any): any[] {
  return schema.map((f: any) => {
    if (!f || typeof f !== 'object') return f;
    if (f.type === 'select') return fn(f, { path: f.name, field: f.name });
    const o = f.options;
    if ((f.type === 'group' || f.type === 'repeater') && Array.isArray(o?.subFields)) {
      const subFields = o.subFields.map((sf: any) => sf?.type === 'select'
        ? fn(sf, { path: `${f.name}.${sf.name}`, field: sf.name, container: { name: f.name, type: f.type } })
        : sf);
      return subFields.some((sf: any, i: number) => sf !== o.subFields[i]) ? { ...f, options: { ...o, subFields } } : f;
    }
    if (f.type === 'flexible' && Array.isArray(o?.layouts)) {
      const layouts = o.layouts.map((l: any) => {
        if (!Array.isArray(l?.fields)) return l;
        const fields = l.fields.map((lf: any) => lf?.type === 'select'
          ? fn(lf, { path: `${f.name}[${l.name}].${lf.name}`, field: lf.name, container: { name: f.name, type: 'flexible', layout: l.name } })
          : lf);
        return fields.some((lf: any, i: number) => lf !== l.fields[i]) ? { ...l, fields } : l;
      });
      return layouts.some((l: any, i: number) => l !== o.layouts[i]) ? { ...f, options: { ...o, layouts } } : f;
    }
    return f;
  });
}

/** Every select field in a schema that uses one of the given lists (all lists when omitted). */
export function selectsUsing(schema: unknown, name?: string): Array<SelectPath & { list: string }> {
  const out: Array<SelectPath & { list: string }> = [];
  if (!Array.isArray(schema)) return out;
  mapSelectFields(schema, (f, at) => {
    const list = choiceListOf(f);
    if (list && (!name || list === name)) out.push({ ...at, list });
    return f;
  });
  return out;
}

/** The names of all lists a set of schemas (or component field lists) use. */
export function listNamesIn(schemas: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const s of schemas) for (const u of selectsUsing(s)) names.add(u.list);
  return names;
}

/** A select field with the list copied in (and `choiceList` set to `name`). */
export function applyChoices(field: any, name: string, choices: Choice[]): any {
  const labels: Record<string, string> = {};
  for (const c of choices) if (c.label && c.label !== c.value) labels[c.value] = c.label;
  const { choiceLabels: _old, ...options } = field.options ?? {};
  return {
    ...field,
    options: {
      ...options,
      choiceList: name,
      choices: choices.map((c) => c.value),
      ...(Object.keys(labels).length ? { choiceLabels: labels } : {}),
    },
  };
}

/** Validate a list name, throwing 400. */
export function validChoiceListName(raw: unknown): string {
  const name = typeof raw === 'string' ? normalizeChoiceListName(raw) : '';
  if (!NAME_RE.test(name)) {
    throw new BadRequestException('name must be lowercase letters, digits, or underscores, starting with a letter or underscore');
  }
  return name;
}

/**
 * Validate and normalize a list's choices: 1–1000 items, each a string or
 * `{ value, label? }`; values non-empty, unique, ≤ 200 characters. Labels are
 * dropped when empty or equal to the value. Throws 400 with every problem.
 */
export function validateChoices(raw: unknown): Choice[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestException('choices must be a non-empty array of { value, label? }');
  }
  if (raw.length > MAX_CHOICES) {
    throw new BadRequestException(`A choice list can hold at most ${MAX_CHOICES} choices`);
  }
  const errors: string[] = [];
  const seen = new Set<string>();
  const out: Choice[] = [];
  raw.forEach((c: any, i: number) => {
    const item = typeof c === 'string' ? { value: c } : c;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`choices[${i}]: must be { value, label? }`);
      return;
    }
    const value = typeof item.value === 'string' ? item.value.trim() : '';
    if (!value) {
      errors.push(`choices[${i}].value: must be a non-empty string`);
      return;
    }
    if (value.length > MAX_VALUE_LENGTH) errors.push(`choices[${i}].value: must be at most ${MAX_VALUE_LENGTH} characters`);
    if (seen.has(value)) errors.push(`choices[${i}].value "${value}": duplicate value`);
    seen.add(value);
    if (item.label !== undefined && item.label !== null && typeof item.label !== 'string') {
      errors.push(`choices[${i}].label: must be a string`);
      return;
    }
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (label.length > MAX_VALUE_LENGTH) errors.push(`choices[${i}].label: must be at most ${MAX_VALUE_LENGTH} characters`);
    out.push(label && label !== value ? { value, label } : { value });
  });
  if (errors.length) throw new BadRequestException({ message: 'Invalid choices', errors });
  return out;
}

// ─── Entries still holding removed values ────────────────────────────────────

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

/** A select value (jsonb expression `v`) that is one of $2, or an array containing one. */
const holdsValue = (v: string) =>
  `(CASE jsonb_typeof(${v})
      WHEN 'string' THEN (${v} #>> '{}') = ANY($2::text[])
      WHEN 'array' THEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(${v}) AS x(val) WHERE x.val = ANY($2::text[]))
      ELSE false END)`;

const items = (container: string) =>
  `jsonb_array_elements(CASE WHEN jsonb_typeof("data" -> '${container}') = 'array' THEN "data" -> '${container}' ELSE '[]'::jsonb END)`;

/**
 * One count query per select field: the live entries of a content type ($1)
 * whose field holds any of the values in $2 (text[]). Returns null for a path
 * with names that aren't plain identifiers (never the case after validation).
 */
export function removedValuesQuery(at: SelectPath): string | null {
  const names = [at.field, at.container?.name, at.container?.layout].filter((n): n is string => n !== undefined);
  if (!names.every((n) => IDENT_RE.test(n))) return null;
  let cond: string;
  if (!at.container) {
    cond = holdsValue(`"data" -> '${at.field}'`);
  } else if (at.container.type === 'group') {
    cond = holdsValue(`"data" -> '${at.container.name}' -> '${at.field}'`);
  } else {
    const layout = at.container.type === 'flexible' ? `it.item ->> '_layout' = '${at.container.layout}' AND ` : '';
    cond = `EXISTS (SELECT 1 FROM ${items(at.container.name)} AS it(item) WHERE ${layout}${holdsValue(`it.item -> '${at.field}'`)})`;
  }
  return `SELECT COUNT(*)::int AS n FROM "entries" WHERE "contentTypeId" = $1 AND "deletedAt" IS NULL AND ${cond}`;
}
