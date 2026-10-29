import { FieldDef } from '../fields/field.types';

/**
 * Section keys: an editor names a flexible section (`_key`, stored next to
 * `_id` and `_layout`) so site code can reach it by name instead of position.
 * Unique within the field; optional for a layout used once, required for every
 * section of a layout used more than once. Public REST reads add
 * `<field>_by_key: { <name>: section }` for each top-level flexible field —
 * a section's key, or its layout name when the layout is used once (explicit
 * keys win a clash). `<field>` itself stays the ordered list.
 */
export const SECTION_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

/** The lookup's property name for a flexible field. */
export const sectionKeysProperty = (field: string) => `${field}_by_key`;

const asRecord = (item: unknown) => (item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : undefined);
const hasKey = (key: unknown) => key !== undefined && key !== null && key !== '';

/** How many sections use each layout. */
function layoutCounts(items: unknown[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const layout = asRecord(item)?._layout;
    if (typeof layout === 'string') counts.set(layout, (counts.get(layout) ?? 0) + 1);
  }
  return counts;
}

/** Errors for the `_key`s of one flexible field's sections. */
export function sectionKeyErrors(items: unknown[], path: string): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const counts = layoutCounts(items);
  items.forEach((item, i) => {
    const row = asRecord(item);
    const key = row?._key;
    if (!hasKey(key)) {
      const layout = row?._layout;
      if (typeof layout === 'string' && (counts.get(layout) ?? 0) > 1) {
        errors.push(`${path}[${i}]._key: required — the layout "${layout}" is used more than once in this field, so each of its sections needs its own key`);
      }
      return;
    }
    if (typeof key !== 'string' || !SECTION_KEY_RE.test(key)) {
      errors.push(`${path}[${i}]._key: must start with a lowercase letter and use only lowercase letters, digits and underscores (max 64)`);
    } else if (seen.has(key)) {
      errors.push(`${path}[${i}]._key "${key}": another section of this field has the same key`);
    } else {
      seen.add(key);
    }
  });
  return errors;
}

/** The sections of one flexible field by name: keys first, then layouts used once under their own name. */
export function sectionsByKey(items: unknown[]): Record<string, unknown> {
  const counts = layoutCounts(items);
  const names = new Map<unknown, string>();
  const taken = new Set<string>();
  for (const item of items) {
    const key = asRecord(item)?._key;
    if (typeof key === 'string' && key && !taken.has(key)) { names.set(item, key); taken.add(key); }
  }
  for (const item of items) {
    const row = asRecord(item);
    const layout = row?._layout;
    if (row && !names.has(item) && !hasKey(row._key) && typeof layout === 'string' && counts.get(layout) === 1 && !taken.has(layout)) {
      names.set(item, layout);
      taken.add(layout);
    }
  }
  // In the field's own order.
  const out: Record<string, unknown> = {};
  for (const item of items) if (names.has(item)) out[names.get(item)!] = item;
  return out;
}

/** `data` plus a `<field>_by_key` lookup for every top-level flexible field with named sections. */
export function withSectionKeys(data: Record<string, any>, schema: FieldDef[]): Record<string, any> {
  const names = new Set(schema.map((f) => f?.name));
  let out = data;
  for (const f of schema) {
    if (f?.type !== 'flexible' || !Array.isArray(data?.[f.name])) continue;
    const prop = sectionKeysProperty(f.name);
    if (names.has(prop) || prop in data) continue; // never shadow a real field
    const byKey = sectionsByKey(data[f.name]);
    if (Object.keys(byKey).length) out = { ...out, [prop]: byKey };
  }
  return out;
}

/**
 * Keys for sections that need one and have none — a layout used more than once:
 * `real_magic`, `real_magic_2`, `real_magic_3`… (for imports, where nobody can
 * type them). Existing keys are kept and never reused.
 */
export function autoSectionKeys<T extends Record<string, unknown>>(items: T[]): T[] {
  const counts = layoutCounts(items);
  const taken = new Set(items.map((i) => i._key).filter((k): k is string => typeof k === 'string' && !!k));
  return items.map((item) => {
    const layout = item._layout;
    if (hasKey(item._key) || typeof layout !== 'string' || (counts.get(layout) ?? 0) < 2) return item;
    const base = layout.slice(0, 60);
    let key = base;
    for (let n = 2; taken.has(key) || !SECTION_KEY_RE.test(key); n++) key = `${base}_${n}`;
    taken.add(key);
    return { ...item, _key: key };
  });
}
