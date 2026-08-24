/**
 * Advanced Dynamic Query & Filter Parser for NodePress Dynamic API.
 * Supports standard REST operators, type coercion, JSON field paths,
 * top-level column mapping, and logical combinators (AND/OR).
 *
 * Supported syntaxes:
 *   - NodePress standard:   ?where[price][gte]=100&where[category][eq]=tech
 *   - Strapi compatibility: ?filters[price][$gte]=100&filters[category][$eq]=tech
 *   - Legacy simple filter: ?filter[category]=tech
 */

const TOP_LEVEL_COLUMNS = new Set([
  'id',
  'publicId',
  'slug',
  'locale',
  'status',
  'createdAt',
  'updatedAt',
]);

/** Convert string query values ("true", "123", "null") to native types */
export function coerceValue(val: any): any {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed) && !isNaN(Number(trimmed))) {
    // Only coerce to number if it's safe and doesn't lose string identity like phone numbers
    // Small numbers or decimals are coerced
    const num = Number(trimmed);
    if (String(num) === trimmed) return num;
  }
  return trimmed;
}

/** Parse an in/notIn value into an array */
export function parseArrayValue(val: any): any[] {
  if (Array.isArray(val)) {
    return val.map(coerceValue);
  }
  if (typeof val === 'string') {
    return val.split(',').map((v) => coerceValue(v.trim())).filter((v) => v !== '');
  }
  return [coerceValue(val)];
}

/**
 * Normalizes operator names:
 *   $eq, eq, equals       -> 'equals'
 *   $ne, ne, not_eq, not  -> 'not'
 *   $gt, gt               -> 'gt'
 *   $gte, gte             -> 'gte'
 *   $lt, lt               -> 'lt'
 *   $lte, lte             -> 'lte'
 *   $in, in               -> 'in'
 *   $notIn, $nin, notIn   -> 'notIn'
 *   $contains, contains, like, icontains -> 'contains'
 *   $startsWith, startsWith -> 'startsWith'
 *   $endsWith, endsWith   -> 'endsWith'
 *   $null, null, is_null  -> 'null'
 *   $notNull, notNull, is_not_null -> 'notNull'
 */
export function normalizeOperator(op: string): string {
  const clean = op.toLowerCase().replace(/^\$/, '');
  switch (clean) {
    case 'eq':
    case 'equals':
      return 'equals';
    case 'ne':
    case 'not_eq':
    case 'not':
      return 'not';
    case 'gt':
    case 'greater_than':
      return 'gt';
    case 'gte':
    case 'greater_than_or_equal':
      return 'gte';
    case 'lt':
    case 'less_than':
      return 'lt';
    case 'lte':
    case 'less_than_or_equal':
      return 'lte';
    case 'in':
      return 'in';
    case 'notin':
    case 'nin':
      return 'notIn';
    case 'contains':
    case 'icontains':
    case 'like':
      return 'contains';
    case 'startswith':
    case 'starts_with':
      return 'startsWith';
    case 'endswith':
    case 'ends_with':
      return 'endsWith';
    case 'null':
    case 'is_null':
      return 'null';
    case 'notnull':
    case 'is_not_null':
      return 'notNull';
    default:
      return 'equals';
  }
}

/**
 * Build Prisma WHERE conditions from advanced `where` or `filters` parameter.
 *
 * @param whereInput - Parsed query object from express (e.g. { price: { gte: "100" }, category: "tech" })
 * @param legacyFilter - Optional legacy filter object (e.g. { category: "tech" })
 */
export function buildAdvancedWhere(
  whereInput?: Record<string, any>,
  legacyFilter?: Record<string, string>,
): any[] {
  const conditions: any[] = [];

  // 1. Process legacy filter (partial text match on data JSON)
  if (legacyFilter && typeof legacyFilter === 'object') {
    for (const [key, value] of Object.entries(legacyFilter)) {
      if (value != null && typeof value === 'string' && value.trim()) {
        if (TOP_LEVEL_COLUMNS.has(key)) {
          conditions.push({ [key]: { contains: value.trim(), mode: 'insensitive' } });
        } else {
          conditions.push({
            data: {
              path: [key],
              string_contains: value.trim(),
            },
          });
        }
      }
    }
  }

  // 2. Process structured `where` / `filters` parameter
  if (!whereInput || typeof whereInput !== 'object') {
    return conditions;
  }

  for (const [rawField, valueOrOps] of Object.entries(whereInput)) {
    if (valueOrOps == null) continue;

    // Handle OR combinators: where: { OR: [ { a: { eq: 1 } }, { b: { eq: 2 } } ] }
    if (rawField.toUpperCase() === 'OR' || rawField === '$or') {
      const orClauses = Array.isArray(valueOrOps)
        ? valueOrOps
        : Object.values(valueOrOps);
      const orConditions: any[] = [];
      for (const clause of orClauses) {
        if (typeof clause === 'object' && clause !== null) {
          const sub = buildAdvancedWhere(clause);
          if (sub.length > 0) {
            orConditions.push(sub.length === 1 ? sub[0] : { AND: sub });
          }
        }
      }
      if (orConditions.length > 0) {
        conditions.push({ OR: orConditions });
      }
      continue;
    }

    // Handle AND combinators: where: { AND: [ ... ] }
    if (rawField.toUpperCase() === 'AND' || rawField === '$and') {
      const andClauses = Array.isArray(valueOrOps)
        ? valueOrOps
        : Object.values(valueOrOps);
      for (const clause of andClauses) {
        if (typeof clause === 'object' && clause !== null) {
          const sub = buildAdvancedWhere(clause);
          conditions.push(...sub);
        }
      }
      continue;
    }

    const isTopLevel = TOP_LEVEL_COLUMNS.has(rawField);

    // Direct scalar match: where[field]=val
    if (typeof valueOrOps !== 'object' || valueOrOps === null) {
      const coerced = coerceValue(valueOrOps);
      if (isTopLevel) {
        conditions.push({ [rawField]: coerced });
      } else {
        conditions.push({
          data: {
            path: [rawField],
            equals: coerced,
          },
        });
      }
      continue;
    }

    // Operator mapping: where[field][gte]=100 or where[field][$eq]=tech
    for (const [rawOp, rawVal] of Object.entries(valueOrOps)) {
      const op = normalizeOperator(rawOp);
      const coerced = coerceValue(rawVal);

      if (isTopLevel) {
        switch (op) {
          case 'equals':
            conditions.push({ [rawField]: coerced });
            break;
          case 'not':
            conditions.push({ [rawField]: { not: coerced } });
            break;
          case 'gt':
            conditions.push({ [rawField]: { gt: coerced } });
            break;
          case 'gte':
            conditions.push({ [rawField]: { gte: coerced } });
            break;
          case 'lt':
            conditions.push({ [rawField]: { lt: coerced } });
            break;
          case 'lte':
            conditions.push({ [rawField]: { lte: coerced } });
            break;
          case 'in':
            conditions.push({ [rawField]: { in: parseArrayValue(rawVal) } });
            break;
          case 'notIn':
            conditions.push({ [rawField]: { notIn: parseArrayValue(rawVal) } });
            break;
          case 'contains':
            conditions.push({ [rawField]: { contains: String(rawVal), mode: 'insensitive' } });
            break;
          case 'startsWith':
            conditions.push({ [rawField]: { startsWith: String(rawVal), mode: 'insensitive' } });
            break;
          case 'endsWith':
            conditions.push({ [rawField]: { endsWith: String(rawVal), mode: 'insensitive' } });
            break;
          case 'null':
            conditions.push({ [rawField]: coerced ? null : { not: null } });
            break;
          case 'notNull':
            conditions.push({ [rawField]: coerced ? { not: null } : null });
            break;
          default:
            conditions.push({ [rawField]: coerced });
        }
      } else {
        // Dynamic JSON field (data: { path: [field], ... })
        switch (op) {
          case 'equals':
            conditions.push({ data: { path: [rawField], equals: coerced } });
            break;
          case 'not':
            conditions.push({ data: { path: [rawField], not: coerced } });
            break;
          case 'gt':
            conditions.push({ data: { path: [rawField], gt: coerced } });
            break;
          case 'gte':
            conditions.push({ data: { path: [rawField], gte: coerced } });
            break;
          case 'lt':
            conditions.push({ data: { path: [rawField], lt: coerced } });
            break;
          case 'lte':
            conditions.push({ data: { path: [rawField], lte: coerced } });
            break;
          case 'in':
            // Prisma JSON array contains or equals
            const inArr = parseArrayValue(rawVal);
            conditions.push({
              OR: inArr.map((item) => ({
                data: { path: [rawField], equals: item },
              })),
            });
            break;
          case 'notIn':
            const notInArr = parseArrayValue(rawVal);
            conditions.push({
              AND: notInArr.map((item) => ({
                data: { path: [rawField], not: item },
              })),
            });
            break;
          case 'contains':
            conditions.push({ data: { path: [rawField], string_contains: String(rawVal) } });
            break;
          case 'startsWith':
            conditions.push({ data: { path: [rawField], string_starts_with: String(rawVal) } });
            break;
          case 'endsWith':
            conditions.push({ data: { path: [rawField], string_ends_with: String(rawVal) } });
            break;
          case 'null':
            conditions.push(
              coerced
                ? { data: { path: [rawField], equals: null } }
                : { data: { path: [rawField], not: null } },
            );
            break;
          case 'notNull':
            conditions.push(
              coerced
                ? { data: { path: [rawField], not: null } }
                : { data: { path: [rawField], equals: null } },
            );
            break;
          default:
            conditions.push({ data: { path: [rawField], equals: coerced } });
        }
      }
    }
  }

  return conditions;
}
