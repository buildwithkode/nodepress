// Field keys in the content type editors. The server refuses two fields with
// the same key, so the editors flag duplicates as they happen and suggest a
// free key when a component is added twice.

/** The snake_case key saved for a field named `name` (what the backend stores). */
export const toFieldKey = (name: string) => name.trim().toLowerCase().replace(/[\s-]+/g, '_');

interface EditorField { name: string; type?: string; component?: string; inline?: unknown; options?: { component?: string } }

/** The key a field in editor state saves under — inline component fields keep theirs as-is. */
export const editorFieldKey = (f: EditorField) => (f.inline ? f.name : toFieldKey(f.name));

/** A field that comes from a component: a group/repeater using one, or an inline component field. */
export const isComponentField = (f: EditorField) =>
  !!f.component || ((f.type === 'group' || f.type === 'repeater') && !!f.options?.component);

/** Keys used by more than one named field. */
export function duplicateKeys(fields: EditorField[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const f of fields) {
    if (!f.name.trim()) continue;
    const key = editorFieldKey(f);
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return dupes;
}

/** Keys of every named field. */
export const takenKeys = (fields: EditorField[]) =>
  new Set(fields.filter((f) => f.name.trim()).map(editorFieldKey));

/** `name`, or `name 2`, `name 3`… — the first whose key isn't taken. */
export function freeFieldName(name: string, taken: Set<string>): string {
  if (!taken.has(toFieldKey(name))) return name;
  let n = 2;
  while (taken.has(toFieldKey(`${name} ${n}`))) n++;
  return `${name} ${n}`;
}
