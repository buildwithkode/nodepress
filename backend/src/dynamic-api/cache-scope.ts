/**
 * Works out which content types a Prisma write touched, so the public cache
 * can drop only those types' responses instead of everything.
 *
 * A scope is a list of content type ids, or 'all' when it can't be narrowed
 * (e.g. an entry moved between types). `null` means "not known yet" — the
 * caller then tries the write's result, and finally a lookup by entry id.
 */
export type CacheScope = number[] | 'all';

export interface WriteParams {
  model?: string;
  action: string;
  args?: any;
}

const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const SINGLE_ACTIONS = new Set(['create', 'update', 'upsert', 'delete']);
export const CACHED_MODELS = new Set(['Entry', 'ContentType']);

export function isCachedWrite(p: WriteParams): boolean {
  return !!p.model && CACHED_MODELS.has(p.model) && WRITE_ACTIONS.has(p.action);
}

/** Ids from an id filter value: `5`, `{ equals: 5 }` or `{ in: [5, 6] }`. */
export function idsIn(value: unknown): number[] | null {
  if (typeof value === 'number') return [value];
  if (value && typeof value === 'object') {
    const v = value as { equals?: unknown; in?: unknown };
    if (typeof v.equals === 'number') return [v.equals];
    if (Array.isArray(v.in) && v.in.every((x) => typeof x === 'number')) return v.in as number[];
  }
  return null;
}

/** Content type id named in an entry's create data, or null. */
function entryDataType(data: any): number[] | null {
  if (!data || typeof data !== 'object') return null;
  return idsIn(data.contentTypeId) ?? idsIn(data.contentType?.connect?.id);
}

function changesEntryType(data: any): boolean {
  return !!data && typeof data === 'object' && ('contentTypeId' in data || 'contentType' in data);
}

function union(...lists: (number[] | null)[]): number[] | null {
  const found = lists.filter((l): l is number[] => l !== null);
  return found.length ? [...new Set(found.flat())] : null;
}

/** Scope taken from the write's own arguments, without touching the database. */
export function scopeFromArgs(p: WriteParams): CacheScope | null {
  const args = p.args ?? {};
  const where = args.where ?? {};

  if (p.model === 'ContentType') {
    return p.action === 'create' || p.action === 'createMany' ? null : idsIn(where.id);
  }

  switch (p.action) {
    case 'create':
      return entryDataType(args.data);
    case 'createMany': {
      const rows: any[] = Array.isArray(args.data) ? args.data : [args.data];
      const types = rows.map(entryDataType);
      return types.every((t) => t !== null) ? union(...types) : null;
    }
    case 'upsert':
      if (changesEntryType(args.update)) return 'all';
      return union(entryDataType(args.create), idsIn(where.contentTypeId), idsIn(where.contentTypeId_slug_locale?.contentTypeId));
    default:
      // update / updateMany / delete / deleteMany
      if (changesEntryType(args.data)) return 'all';
      return union(idsIn(where.contentTypeId), idsIn(where.contentTypeId_slug_locale?.contentTypeId));
  }
}

/** Scope taken from the record a single-row write returned (absent under a narrow `select`). */
export function scopeFromResult(p: WriteParams, result: any): CacheScope | null {
  if (!SINGLE_ACTIONS.has(p.action) || !result || typeof result !== 'object') return null;
  const id = p.model === 'ContentType' ? result.id : result.contentTypeId;
  return typeof id === 'number' ? [id] : null;
}

/** Entry ids to look the content type up by, when nothing else names it. */
export function entryIdsToLookUp(p: WriteParams): number[] | null {
  return p.model === 'Entry' ? idsIn(p.args?.where?.id) : null;
}

/** A *Many write that matched no rows changed nothing. */
export function changedNothing(result: any): boolean {
  return !!result && typeof result === 'object' && result.count === 0;
}
