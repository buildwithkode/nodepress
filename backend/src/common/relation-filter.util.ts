import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { FieldDef, RelationFieldDef, isReverseRelation } from '../fields/field.types';
import { buildAdvancedWhere } from './filter-query.util';

/** A relation filter may match at most this many related entries. */
export const RELATION_FILTER_LIMIT = 1000;

/** Every spelling normalizeOperator() in filter-query.util accepts. */
const OPERATORS = new Set([
  'eq', 'equals', 'ne', 'not_eq', 'not', 'gt', 'greater_than', 'gte', 'greater_than_or_equal', 'lt', 'less_than',
  'lte', 'less_than_or_equal', 'in', 'notin', 'nin', 'contains', 'icontains', 'like', 'startswith', 'starts_with',
  'endswith', 'ends_with', 'null', 'is_null', 'notnull', 'is_not_null',
]);
const isOperator = (key: string) => OPERATORS.has(key.toLowerCase().replace(/^\$/, ''));

/**
 * Pull filters on a related entry's fields out of `where`:
 *
 *   ?where[author][slug][eq]=jane      (or where[author.slug][eq]=jane)
 *   ?where[tags][name][in]=news,tech
 *
 * Each becomes "the relation points at one of the matching entries" — the
 * matching publicIds are looked up first (published, not deleted), then
 * compared with the stored UUIDs. `where[author][eq]=<uuid>` is untouched.
 * One level deep; reverse fields can't be filtered on.
 */
export async function extractRelationFilters(
  where: Record<string, any> | undefined,
  schema: FieldDef[],
  db: PrismaClient,
  options: { publishedOnly?: boolean } = {},
): Promise<{ where: Record<string, any> | undefined; conditions: any[] }> {
  if (!where || typeof where !== 'object') return { where, conditions: [] };
  const relations = new Map(
    schema.filter((f): f is RelationFieldDef => f.type === 'relation' && !isReverseRelation(f)).map((f) => [f.name, f]),
  );
  if (relations.size === 0) return { where, conditions: [] };

  const rest: Record<string, any> = {};
  const nested = new Map<string, Record<string, any>>();
  for (const [key, value] of Object.entries(where)) {
    const [head, ...path] = key.split('.');
    const field = relations.get(head);
    if (field && path.length) {
      nested.set(head, { ...nested.get(head), [path.join('.')]: value });
    } else if (field && value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).some((k) => !isOperator(k))) {
      nested.set(head, { ...nested.get(head), ...value });
    } else {
      rest[key] = value;
    }
  }
  if (nested.size === 0) return { where, conditions: [] };

  const conditions: any[] = [];
  for (const [name, sub] of nested) {
    const field = relations.get(name)!;
    if (Object.keys(sub).some((k) => k.includes('.'))) {
      throw new BadRequestException(`where[${name}]: relation filters go one level deep`);
    }
    const target = await db.contentType.findUnique({ where: { name: field.options.relatedContentType } });
    const ids = target
      ? (
          await db.entry.findMany({
            where: {
              contentTypeId: target.id,
              deletedAt: null,
              ...(options.publishedOnly ? { status: 'published' } : {}),
              AND: buildAdvancedWhere(sub),
            },
            select: { publicId: true },
            take: RELATION_FILTER_LIMIT + 1,
          })
        ).map((e) => e.publicId)
      : [];
    if (ids.length > RELATION_FILTER_LIMIT) {
      throw new BadRequestException(
        `where[${name}] matches more than ${RELATION_FILTER_LIMIT} ${field.options.relatedContentType} entries — narrow it`,
      );
    }
    if (ids.length === 0) {
      conditions.push({ id: { in: [] } }); // matches nothing
    } else if (field.options.cardinality === 'many') {
      conditions.push({ OR: ids.map((id) => ({ data: { path: [name], array_contains: [id] } })) });
    } else {
      conditions.push({ OR: ids.map((id) => ({ data: { path: [name], equals: id } })) });
    }
  }
  return { where: rest, conditions };
}
