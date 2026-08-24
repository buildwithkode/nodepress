import { PrismaService } from '../prisma/prisma.service';
import { FieldDef, RelationFieldDef } from '../fields/field.types';

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
 * @param prisma        - PrismaService instance
 * @param depth         - Current recursion depth (internal — starts at 0, max 3)
 */
export async function populateManyDeep(
  entriesData: Record<string, any>[],
  schema: FieldDef[],
  populatePaths: string[],
  prisma: PrismaService,
  depth = 0,
): Promise<Record<string, any>[]> {
  const MAX_DEPTH = 3;
  if (depth >= MAX_DEPTH || populatePaths.length === 0 || entriesData.length === 0) {
    return entriesData;
  }

  const tree = parsePopulatePaths(populatePaths);
  const topFields = [...tree.keys()];

  const relationFields = schema.filter(
    (f): f is RelationFieldDef => f.type === 'relation' && topFields.includes(f.name),
  );
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
    where: { publicId: { in: [...allIds] }, deletedAt: null },
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
 * @param prisma        - PrismaService instance
 * @param depth         - Current recursion depth (internal — starts at 0)
 */
export async function populateDeep(
  data: Record<string, any>,
  schema: FieldDef[],
  populatePaths: string[],
  prisma: PrismaService,
  depth = 0,
): Promise<Record<string, any>> {
  const [populated] = await populateManyDeep([data], schema, populatePaths, prisma, depth);
  return populated ?? data;
}
