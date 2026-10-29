// Entry data as it is saved and shown in the JSON preview: the contents of
// groups, repeater rows and flexible sections are cut down to the fields their
// schema defines. Without this, values typed into a section before its layout
// was switched (or fields since removed from a layout or component) would stay
// in the saved JSON. Top-level keys are left alone — plugins add their own
// (`_seo_score`…), and removed top-level fields are kept on purpose.

interface SchemaField { name: string; type: string; options?: { subFields?: SchemaField[]; layouts?: { name: string; fields?: SchemaField[] }[] } }

/** Keys every row keeps: the stable row id and, in flexible fields, the layout and section key. */
const ROW_KEYS = ['_id', '_layout', '_key'];

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function pruneObject(value: Record<string, unknown>, fields: SchemaField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // An empty section key means "no key".
  for (const key of ROW_KEYS) if (key in value && value[key] !== '' && value[key] != null) out[key] = value[key];
  for (const f of fields) if (f.name in value) out[f.name] = pruneValue(value[f.name], f);
  return out;
}

function pruneValue(value: unknown, field: SchemaField): unknown {
  const subs = field.options?.subFields ?? [];
  if (field.type === 'group') return isObject(value) ? pruneObject(value, subs) : value;
  if (field.type === 'repeater') return Array.isArray(value) ? value.map((row) => (isObject(row) ? pruneObject(row, subs) : row)) : value;
  if (field.type === 'flexible') {
    if (!Array.isArray(value)) return value;
    const layouts = field.options?.layouts ?? [];
    return value.map((item) => {
      if (!isObject(item)) return item;
      const layout = layouts.find((l) => l.name === item._layout);
      // An unknown layout (renamed or removed) is kept as it is rather than emptied.
      return layout ? pruneObject(item, layout.fields ?? []) : item;
    });
  }
  return value;
}

/** `data` with every container value cut down to its schema. */
export function pruneEntryData(data: Record<string, unknown>, schema: SchemaField[]): Record<string, unknown> {
  const byName = new Map(schema.map((f) => [f.name, f]));
  return Object.fromEntries(Object.entries(data).map(([k, v]) => {
    const f = byName.get(k);
    return [k, f ? pruneValue(v, f) : v];
  }));
}
