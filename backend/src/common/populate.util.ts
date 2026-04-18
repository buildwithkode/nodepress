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
 * Recursively populate relation fields in an entry's data object.
 *
 * Supports nested dot-notation paths up to MAX_DEPTH levels deep:
 *   ?populate=author            → resolves author UUID → full entry
 *   ?populate=author,author.company → also resolves company inside author
 *
 * All top-level relations are batch-fetched in a single DB query per level.
 * Nested levels each make one additional batched query.
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
  const MAX_DEPTH = 3;
  if (depth >= MAX_DEPTH || populatePaths.length === 0) return data;

  const tree        = parsePopulatePaths(populatePaths);
  const topFields   = [...tree.keys()];
  const result      = { ...data };

  const relationFields = schema.filter(
    (f): f is RelationFieldDef => f.type === 'relation' && topFields.includes(f.name),
  );
  if (relationFields.length === 0) return result;

  // Collect all publicIds across every relation field in one pass
  const allIds = new Set<string>();
  for (const field of relationFields) {
    const raw = data[field.name];
    if (!raw) continue;
    const ids: string[] = Array.isArray(raw) ? raw : [raw];
    for (const id of ids) { if (id) allIds.add(id); }
  }
  if (allIds.size === 0) return result;

  // Single batched query — one round-trip for all top-level relations at this level
  const relatedEntries = await prisma.entry.findMany({
    where:   { publicId: { in: [...allIds] }, deletedAt: null },
    include: { contentType: true },
  });
  const byId = new Map(relatedEntries.map((e) => [e.publicId, e]));

  for (const field of relationFields) {
    const raw = data[field.name];
    if (!raw) continue;
    const ids: string[] = Array.isArray(raw) ? raw : [raw];
    let resolved = ids.map((id) => byId.get(id)).filter(Boolean) as any[];

    // Recursively resolve nested paths (e.g. "company" inside "author")
    const subPaths = tree.get(field.name) ?? [];
    if (subPaths.length > 0 && resolved.length > 0) {
      resolved = await Promise.all(
        resolved.map(async (entry) => {
          const entryData   = entry.data as Record<string, any>;
          const entrySchema = (entry.contentType?.schema ?? []) as FieldDef[];
          const populated   = await populateDeep(entryData, entrySchema, subPaths, prisma, depth + 1);
          return { ...entry, data: populated };
        }),
      );
    }

    result[field.name] =
      field.options?.cardinality === 'many' ? resolved : (resolved[0] ?? null);
  }

  return result;
}
