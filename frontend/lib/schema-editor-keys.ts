/**
 * The content type editor remembers the key every loaded sub-field had
 * (`_key`), so renaming a field inside a group, repeater or flexible layout can
 * be sent as a field migration and existing values follow it. `_key` never
 * reaches the API.
 */
const toKey = (name: string) => name.trim().toLowerCase().replace(/[\s-]+/g, '_');

type Options = { subFields?: any[]; layouts?: any[] } & Record<string, any>;

/** Schema options from the API → editor state with the loaded keys remembered (at every depth). */
export function withLoadedKeys(options: Options | undefined): Options | undefined {
  if (!options) return options;
  const keyed = (f: any) => ({ ...f, _key: f.name, ...(f.options ? { options: withLoadedKeys(f.options) } : {}) });
  return {
    ...options,
    ...(options.subFields ? { subFields: options.subFields.map(keyed) } : {}),
    ...(options.layouts ? { layouts: options.layouts.map((l) => ({ ...l, fields: (l.fields ?? []).map(keyed) })) } : {}),
  };
}

/** Editor options → what is saved (no `_key`, at any depth). */
export function withoutLoadedKeys(options: Options | undefined): Options | undefined {
  if (!options) return options;
  const strip = ({ _key, ...rest }: any) => (rest.options ? { ...rest, options: withoutLoadedKeys(rest.options) } : rest);
  return {
    ...options,
    ...(options.subFields ? { subFields: options.subFields.map(strip) } : {}),
    ...(options.layouts ? { layouts: options.layouts.map((l) => ({ ...l, fields: (l.fields ?? []).map(strip) })) } : {}),
  };
}

/**
 * Renames inside containers, at any depth, as field-migration paths named by
 * the containers' new keys: `links.href` → `links.url`,
 * `blocks.hero.heading` → `blocks.hero.title`,
 * `blocks.hero.buttons.label` → `blocks.hero.buttons.text`.
 */
export function nestedRenames(fields: { name: string; type: string; options?: Options }[]) {
  const renames: { from: string; to: string }[] = [];
  const collect = (prefix: string, list: any[] = []) => {
    const keys = new Set(list.filter((f) => f.name?.trim()).map((f) => toKey(f.name)));
    const loaded = new Set(list.map((f) => f._key).filter(Boolean));
    for (const f of list) {
      const key = f.name?.trim() ? toKey(f.name) : '';
      if (f._key && key && key !== f._key && !keys.has(f._key) && !loaded.has(key)) {
        renames.push({ from: `${prefix}.${f._key}`, to: `${prefix}.${key}` });
      }
    }
    for (const f of list) if (f.name?.trim()) inside(`${prefix}.${toKey(f.name)}`, f);
  };
  // The fields inside one container, `path` being its (new) path.
  const inside = (path: string, f: any) => {
    // Component groups/repeaters/layouts are renamed on /components.
    if ((f.type === 'group' || f.type === 'repeater') && !f.options?.component) collect(path, f.options?.subFields);
    if (f.type === 'flexible') {
      for (const l of f.options?.layouts ?? []) if (l.name?.trim() && !l.component) collect(`${path}.${toKey(l.name)}`, l.fields);
    }
  };
  for (const f of fields) if (f.name.trim()) inside(toKey(f.name), f);
  return renames;
}
