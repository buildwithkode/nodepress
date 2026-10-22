import { Prisma, PrismaClient } from '@prisma/client';
import { FieldDef, RelationFieldDef, isReverseRelation } from '../fields/field.types';

/** Reverse fields return at most this many linked entries per entry. */
export const REVERSE_LIMIT = 100;
const SAFE_FIELD = /^[a-z_][a-z0-9_]*$/;

export interface PopulateOptions {
  /** Public reads: only resolve published entries. */
  publishedOnly?: boolean;
  /** publicId of each entry in `entriesData` (same order) — reverse fields need it. */
  ownerIds?: (string | undefined)[];
}

/**
 * Parse dot-separated populate paths into a field → sub-paths tree.
 *
 * Examples:
 *   ["author"]                       → { author: [] }
 *   ["author", "author.company"]     → { author: ["company"] }
 *   ["author.company.address"]       → { author: ["company.address"] }
 *   ["tags", "author", "author.bio"] → { tags: [], author: ["bio"] }
 */
export function parsePopulatePaths(paths: string[]): Map<string, string[]> {
  const tree = new Map<string, string[]>();
  for (const path of paths) {
    const [field, ...rest] = path.split('.');
    if (!tree.has(field)) tree.set(field, []);
    if (rest.length > 0) tree.get(field)!.push(rest.join('.'));
  }
  return tree;
}

/**
 * Efficiently populate relation fields across an entire array of entries in batch.
 *
 * Instead of issuing N queries for N entries (N+1 bottleneck), this collects all
 * relation UUIDs across all entries on the page and resolves them in a single batch
 * query per depth level.
 *
 * @param entriesData   - Array of entry data objects
 * @param schema        - FieldDef[] from the content type schema
 * @param populatePaths - Dot-notation paths (e.g. ["author", "author.company"])
 * @param prisma        - Prisma client (primary or read replica)
 * @param depth         - Current recursion depth (internal — starts at 0, max 3)
 */
export async function populateManyDeep(
  entriesData: Record<string, any>[],
  schema: FieldDef[],
  populatePaths: string[],
  prisma: PrismaClient,
  depth = 0,
  options: PopulateOptions = {},
): Promise<Record<string, any>[]> {
  const MAX_DEPTH = 3;
  if (depth >= MAX_DEPTH || populatePaths.length === 0 || entriesData.length === 0) {
    return entriesData;
  }

  const tree = parsePopulatePaths(populatePaths);
  const topFields = [...tree.keys()];

  const requested = schema.filter(
    (f): f is RelationFieldDef => f.type === 'relation' && topFields.includes(f.name),
  );
  if (requested.length === 0) return entriesData;
  const relationFields = requested.filter((f) => !isReverseRelation(f));
  const reverseFields = requested.filter((f) => isReverseRelation(f));
  const visible = options.publishedOnly ? { status: 'published' } : {};

  // Reverse fields are resolved first, into copies, so the forward pass below
  // and its nested populate see them like any other populated value.
  if (reverseFields.length > 0) {
    entriesData = await populateReverse(entriesData, reverseFields, tree, prisma, depth, options);
  }
  if (relationFields.length === 0) return entriesData;

  // 1. Collect all publicIds across all entries for all relation fields in this level
  const allIds = new Set<string>();
  for (const data of entriesData) {
    if (!data) continue;
    for (const field of relationFields) {
      const raw = data[field.name];
      if (!raw) continue;
      const ids: string[] = Array.isArray(raw) ? raw : [raw];
      for (const id of ids) {
        if (id && typeof id === 'string') allIds.add(id);
      }
    }
  }

  if (allIds.size === 0) return entriesData;

  // 2. Single batched query for the entire page of entries
  const relatedEntries = await prisma.entry.findMany({
    where: { publicId: { in: [...allIds] }, deletedAt: null, ...visible },
    include: { contentType: true },
  });
  const byId = new Map(relatedEntries.map((e) => [e.publicId, e]));

  // 3. For any relation field that has nested populate subpaths, batch-populate those relations
  for (const field of relationFields) {
    const subPaths = tree.get(field.name) ?? [];
    if (subPaths.length === 0) continue;

    // Collect all related entries for this specific field across all page entries
    const fieldRelatedEntries: any[] = [];
    for (const data of entriesData) {
      const raw = data?.[field.name];
      if (!raw) continue;
      const ids: string[] = Array.isArray(raw) ? raw : [raw];
      for (const id of ids) {
        const found = byId.get(id);
        if (found) fieldRelatedEntries.push(found);
      }
    }

    if (fieldRelatedEntries.length === 0) continue;

    // Group related entries by their contentType schema
    const bySchema = new Map<string, { schema: FieldDef[]; entries: any[] }>();
    for (const relEntry of fieldRelatedEntries) {
      const ctName = relEntry.contentType?.name ?? 'unknown';
      if (!bySchema.has(ctName)) {
        bySchema.set(ctName, {
          schema: (relEntry.contentType?.schema ?? []) as FieldDef[],
          entries: [],
        });
      }
      bySchema.get(ctName)!.entries.push(relEntry);
    }

    // Recursively batch-populate sub-relations for each target schema
    for (const { schema: targetSchema, entries: targetEntries } of bySchema.values()) {
      const targetDataList = targetEntries.map((e) => e.data as Record<string, any>);
      const populatedTargetData = await populateManyDeep(
        targetDataList,
        targetSchema,
        subPaths,
        prisma,
        depth + 1,
        { ...options, ownerIds: targetEntries.map((e) => e.publicId) },
      );
      for (let i = 0; i < targetEntries.length; i++) {
        targetEntries[i].data = populatedTargetData[i];
      }
    }
  }

  // 4. Map the resolved entities back to each entry in the result array
  return entriesData.map((data) => {
    if (!data) return data;
    const result = { ...data };
    for (const field of relationFields) {
      const raw = data[field.name];
      if (!raw) continue;
      const ids: string[] = Array.isArray(raw) ? raw : [raw];
      const resolved = ids.map((id) => byId.get(id)).filter(Boolean) as any[];
      result[field.name] =
        field.options?.cardinality === 'many' ? resolved : (resolved[0] ?? null);
    }
    return result;
  });
}

/**
 * Recursively populate relation fields in a single entry's data object.
 *
 * Supports nested dot-notation paths up to MAX_DEPTH levels deep:
 *   ?populate=author            → resolves author UUID → full entry
 *   ?populate=author,author.company → also resolves company inside author
 *
 * @param data          - The entry's data object
 * @param schema        - FieldDef[] from the content type schema
 * @param populatePaths - Dot-notation paths (e.g. ["author", "author.company"])
 * @param prisma        - Prisma client (primary or read replica)
 * @param depth         - Current recursion depth (internal — starts at 0)
 */
export async function populateDeep(
  data: Record<string, any>,
  schema: FieldDef[],
  populatePaths: string[],
  prisma: PrismaClient,
  depth = 0,
  options: PopulateOptions & { ownerId?: string } = {},
): Promise<Record<string, any>> {
  const { ownerId, ...rest } = options;
  const [populated] = await populateManyDeep([data], schema, populatePaths, prisma, depth, {
    ...rest,
    ownerIds: [ownerId],
  });
  return populated ?? data;
}

/**
 * Fill reverse fields (`options.mappedBy`): the entries of the related type
 * whose `mappedBy` relation points at each owner. Nothing is stored on this
 * side — the forward field is the single source of truth, so the two sides
 * can't drift. At most REVERSE_LIMIT per owner, newest first.
 */
async function populateReverse(
  entriesData: Record<string, any>[],
  fields: RelationFieldDef[],
  tree: Map<string, string[]>,
  prisma: PrismaClient,
  depth: number,
  options: PopulateOptions,
): Promise<Record<string, any>[]> {
  const ownerIds = options.ownerIds ?? [];
  const owners = [...new Set(ownerIds.filter((id): id is string => typeof id === 'string'))];
  const result = entriesData.map((d) => (d ? { ...d } : d));
  if (owners.length === 0) {
    for (const f of fields) result.forEach((d) => d && (d[f.name] = f.options.cardinality === 'one' ? null : []));
    return result;
  }

  for (const field of fields) {
    const back = field.options.mappedBy!;
    const target = await prisma.contentType.findUnique({ where: { name: field.options.relatedContentType } });
    const many = field.options.cardinality !== 'one';
    if (!target || !SAFE_FIELD.test(back)) {
      result.forEach((d) => d && (d[field.name] = many ? [] : null));
      continue;
    }
    const status = options.publishedOnly ? Prisma.sql`AND e.status = 'published'` : Prisma.empty;
    // `data #> '{field}'` is the expression the field indexes use, so an
    // `indexed` forward field makes this an index lookup per owner.
    const path = `{${back}}`;
    const pairs = await prisma.$queryRaw<{ owner: string; id: number }[]>`
      SELECT o.owner, e.id
      FROM unnest(${owners}::text[]) AS o(owner)
      CROSS JOIN LATERAL (
        SELECT e.id FROM entries e
        WHERE e."contentTypeId" = ${target.id} AND e."deletedAt" IS NULL ${status}
          AND (e.data #> ${path}::text[] = to_jsonb(o.owner)
               OR e.data #> ${path}::text[] @> jsonb_build_array(o.owner))
        ORDER BY e."createdAt" DESC, e.id DESC
        LIMIT ${REVERSE_LIMIT}
      ) e`;

    const rows = pairs.length
      ? await prisma.entry.findMany({ where: { id: { in: [...new Set(pairs.map((p) => p.id))] } }, include: { contentType: true } })
      : [];
    const subPaths = tree.get(field.name) ?? [];
    if (subPaths.length && rows.length) {
      const nested = await populateManyDeep(
        rows.map((r) => r.data as Record<string, any>),
        target.schema as unknown as FieldDef[],
        subPaths,
        prisma,
        depth + 1,
        { ...options, ownerIds: rows.map((r) => r.publicId) },
      );
      rows.forEach((r, i) => (r.data = nested[i] as any));
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    const byOwner = new Map<string, any[]>();
    for (const { owner, id } of pairs) {
      const row = byId.get(id);
      if (row) byOwner.set(owner, [...(byOwner.get(owner) ?? []), row]);
    }
    result.forEach((d, i) => {
      if (!d) return;
      const linked = byOwner.get(ownerIds[i] as string) ?? [];
      d[field.name] = many ? linked : (linked[0] ?? null);
    });
  }
  return result;
}
