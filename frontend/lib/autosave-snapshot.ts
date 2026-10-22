/**
 * Autosave compares what it would send with what was loaded (or last saved),
 * so opening an entry doesn't save it. Inputs fill in blanks as they mount —
 * '' for an empty text field, false for a switch, {} rows for a group — so
 * empty values are dropped before comparing.
 */
function meaningful(value: unknown): unknown {
  if (value === '' || value === null || value === undefined || value === false) return undefined;
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;
  if (Array.isArray(value)) {
    const items = value.map(meaningful);
    return items.some((v) => v !== undefined) ? items : undefined;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      const v = meaningful((value as Record<string, unknown>)[key]);
      if (v !== undefined) out[key] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

export const autosaveSnapshot = (payload: unknown) => JSON.stringify(meaningful(payload) ?? null);
