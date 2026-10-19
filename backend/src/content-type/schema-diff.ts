/** Field-level differences between two content type schemas (top-level fields, matched by name). */
export interface SchemaDiff {
  added: string[];
  removed: string[];
  typeChanged: { name: string; from: string; to: string }[];
  nowRequired: string[];
  /** Same name and type, but other settings (label, options, roles, …) differ. */
  modified: string[];
  unchanged: boolean;
}

/** Key order doesn't matter when comparing field settings. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
}

export function diffSchemas(oldSchema: any[] = [], newSchema: any[] = []): SchemaDiff {
  const before = new Map(oldSchema.map((f) => [f?.name, f]));
  const after = new Map(newSchema.map((f) => [f?.name, f]));

  const diff: SchemaDiff = { added: [], removed: [], typeChanged: [], nowRequired: [], modified: [], unchanged: true };

  for (const name of before.keys()) if (!after.has(name)) diff.removed.push(name);

  for (const [name, field] of after) {
    const old = before.get(name);
    if (!old) {
      diff.added.push(name);
      continue;
    }
    if (old.type !== field.type) {
      diff.typeChanged.push({ name, from: old.type, to: field.type });
      continue;
    }
    if (!old.required && field.required) diff.nowRequired.push(name);
    const { required: _a, ...oldRest } = old;
    const { required: _b, ...newRest } = field;
    if (stable(oldRest) !== stable(newRest)) diff.modified.push(name);
  }

  diff.unchanged =
    !diff.added.length && !diff.removed.length && !diff.typeChanged.length && !diff.nowRequired.length && !diff.modified.length;
  return diff;
}
