import {
  GraphQLBoolean,
  GraphQLFieldConfig,
  GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNamedType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType,
  validateSchema,
} from 'graphql';
import { FieldDef, FlexibleLayout, RelationFieldDef, SimpleFieldDef, isReverseRelation } from '../fields/field.types';
import { contentTypePath } from '../common/content-type-name';

/**
 * Typed GraphQL for content types: for each content type `blog_post` the
 * schema gets a `BlogPost` type (with `data: BlogPostData` built from its
 * fields), `blogPost(slug, locale, fallback)` and `blogPosts(...)` queries.
 * Relation fields resolve to the related type, reverse fields included.
 *
 * Pure — the resolvers come from the caller, so this can be rebuilt whenever
 * content types change and unit-tested without Nest.
 */

export interface ContentTypeRow {
  name: string;
  displayName?: string | null;
  schema: unknown;
  allowedMethods?: unknown;
}

/** A published entry in its public REST shape (`id` is the publicId). */
export interface PublicEntry {
  id: string;
  slug: string;
  locale: string;
  data: Record<string, any>;
  seo?: unknown;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ContentResolvers {
  list(type: string, args: Record<string, any>, ctx: any): Promise<{ data: PublicEntry[]; meta: Record<string, any> }>;
  single(type: string, args: Record<string, any>, ctx: any): Promise<PublicEntry | null>;
  /** The related entry (or entries) of a top-level relation field — forward or reverse. */
  relation(owner: PublicEntry, ownerType: string, field: RelationFieldDef, ctx: any): Promise<PublicEntry | PublicEntry[] | null>;
}

export interface BuiltContentSchema {
  schema: GraphQLSchema;
  /** Content types left out, with the reason. */
  skipped: Array<{ name: string; reason: string }>;
  /** Content type name → its query field names. */
  queries: Record<string, { single?: string; list?: string }>;
}

const GQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;

export function pascal(name: string): string {
  const out = name
    .replace(/[^0-9A-Za-z_]+/g, '_')
    .split('_')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('');
  return /^[0-9]/.test(out) ? `T${out}` : out;
}

const camel = (name: string) => {
  const p = pascal(name);
  return p[0].toLowerCase() + p.slice(1);
};

export function plural(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

const methods = (ct: ContentTypeRow) => (Array.isArray(ct.allowedMethods) ? (ct.allowedMethods as string[]) : null);
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const asString = (v: unknown) =>
  v == null ? null : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
const asNumber = (v: unknown) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const asBoolean = (v: unknown) => (v == null ? null : v === true || v === 'true' || v === 1);
const asStringList = (v: unknown) => (v == null ? null : (Array.isArray(v) ? v : [v]).map(asString).filter((s) => s !== null));

export function buildContentSchema(
  base: GraphQLSchema,
  contentTypes: ContentTypeRow[],
  resolvers: ContentResolvers,
): BuiltContentSchema {
  const JSONScalar = (base.getType('JSON') as GraphQLScalarType | undefined) ?? new GraphQLScalarType({ name: 'JSON' });
  const baseQuery = base.getQueryType()!;
  const usedTypes = new Set(Object.keys(base.getTypeMap()));
  const usedQueries = new Set(Object.keys(baseQuery.getFields()));
  const skipped: BuiltContentSchema['skipped'] = [];
  const queries: BuiltContentSchema['queries'] = {};
  const newTypes: GraphQLNamedType[] = [];

  const claim = (name: string) => {
    let n = name;
    for (let i = 2; usedTypes.has(n); i++) n = `${name}${i}`;
    usedTypes.add(n);
    return n;
  };

  const Image = new GraphQLObjectType({
    name: claim('NodePressImage'),
    fields: { url: { type: GraphQLString }, alt: { type: GraphQLString } },
  });
  const ListMeta = new GraphQLObjectType({
    name: claim('NodePressListMeta'),
    fields: {
      total: { type: GraphQLInt },
      page: { type: GraphQLInt },
      limit: { type: new GraphQLNonNull(GraphQLInt) },
      totalPages: { type: GraphQLInt },
      nextCursor: { type: GraphQLString, description: 'Pass as `cursor` for the next page; null on the last page.' },
      searchMode: { type: GraphQLString },
    },
  });
  newTypes.push(Image, ListMeta);

  // Names first, so relations can point at types defined later.
  const entryTypes = new Map<string, GraphQLObjectType>();
  const planned: Array<{ ct: ContentTypeRow; typeName: string; single: string; list: string }> = [];
  for (const ct of contentTypes) {
    const typeName = pascal(ct.name);
    const single = camel(ct.name);
    let list = plural(single);
    if (list === single) list = `${single}List`;
    if (!typeName || !GQL_NAME.test(typeName)) {
      skipped.push({ name: ct.name, reason: 'name is not a valid GraphQL name' });
    } else if (usedTypes.has(typeName) || usedTypes.has(`${typeName}List`) || usedTypes.has(`${typeName}Data`)) {
      skipped.push({ name: ct.name, reason: `GraphQL type "${typeName}" is already taken` });
    } else if (usedQueries.has(single) || usedQueries.has(list)) {
      skipped.push({ name: ct.name, reason: `query "${usedQueries.has(single) ? single : list}" is already taken` });
    } else {
      [typeName, `${typeName}List`, `${typeName}Data`].forEach((n) => usedTypes.add(n));
      usedQueries.add(single).add(list);
      planned.push({ ct, typeName, single, list });
    }
  }

  /** A field inside `data` (top level, group, repeater item or flexible block). */
  const valueField = (
    field: SimpleFieldDef,
    get: (parent: any) => unknown,
  ): GraphQLFieldConfig<any, any> => {
    const description = field.description || field.label || undefined;
    switch (field.type) {
      case 'number':
        return { type: GraphQLFloat, description, resolve: (p) => asNumber(get(p)) };
      case 'boolean':
        return { type: GraphQLBoolean, description, resolve: (p) => asBoolean(get(p)) };
      case 'select':
        return field.options?.multiple
          ? { type: new GraphQLList(new GraphQLNonNull(GraphQLString)), description, resolve: (p) => asStringList(get(p)) }
          : { type: GraphQLString, description, resolve: (p) => asString(get(p)) };
      case 'image':
        return {
          type: Image,
          description,
          resolve: (p) => {
            const v = get(p) as any;
            return typeof v === 'string' ? { url: v } : v && typeof v === 'object' ? v : null;
          },
        };
      case 'relation':
        // Inside groups/repeaters/blocks relations stay ids; only top-level ones resolve.
        return field.options?.cardinality === 'many'
          ? { type: new GraphQLList(new GraphQLNonNull(GraphQLID)), description, resolve: (p) => asStringList(get(p)) }
          : { type: GraphQLID, description, resolve: (p) => asString(get(p)) };
      case 'json':
        return { type: JSONScalar, description, resolve: (p) => get(p) ?? null };
      case 'text':
      case 'textarea':
      case 'richtext':
      case 'color':
      case 'date':
      case 'datetime':
        return { type: GraphQLString, description, resolve: (p) => asString(get(p)) };
      default:
        return { type: JSONScalar, description, resolve: (p) => get(p) ?? null };
    }
  };

  const usable = (f: any): boolean => !!f && typeof f.name === 'string' && GQL_NAME.test(f.name) && !f.name.startsWith('__');

  const isContainer = (f: any) => f?.type === 'group' || f?.type === 'repeater' || f?.type === 'flexible';

  /** An object type for a group, a repeater item or a flexible block; nested containers get their own types. */
  const subObject = (name: string, fields: FieldDef[], extra: GraphQLFieldConfigMap<any, any> = {}) => {
    const map: GraphQLFieldConfigMap<any, any> = { ...extra };
    for (const sf of fields ?? []) {
      if (!usable(sf) || sf.name in map) continue;
      const get = (p: any) => p?.[sf.name];
      map[sf.name] = isContainer(sf)
        ? containerField(`${name}${pascal(sf.name)}`, sf, get)
        : valueField(sf as SimpleFieldDef, get);
    }
    if (Object.keys(map).length === 0) return null;
    const type = new GraphQLObjectType({ name: claim(name), fields: map });
    newTypes.push(type);
    return type;
  };

  /** A group (object), repeater (list of items) or flexible field (list of a union of blocks), at any depth. */
  const containerField = (typeName: string, f: any, get: (parent: any) => unknown): GraphQLFieldConfig<any, any> => {
    const description = f.description || f.label || undefined;
    const json = { type: JSONScalar, description, resolve: (p: any) => get(p) ?? null };
    switch (f.type) {
      case 'group': {
        const type = subObject(typeName, f.options?.subFields);
        return type ? { type, description, resolve: (p) => { const v = get(p); return v && typeof v === 'object' ? v : null; } } : json;
      }
      case 'repeater': {
        const type = subObject(`${typeName}Item`, f.options?.subFields, { _id: { type: GraphQLString } })!;
        return {
          type: new GraphQLList(new GraphQLNonNull(type)),
          description,
          resolve: (p) => { const v = get(p); return Array.isArray(v) ? v.filter((i) => i && typeof i === 'object') : null; },
        };
      }
      default: {
        const layouts: FlexibleLayout[] = (f.options?.layouts ?? []).filter((l: any) => l?.name);
        const blockTypes = new Map<string, GraphQLObjectType>();
        for (const layout of layouts) {
          blockTypes.set(layout.name, subObject(`${typeName}${pascal(layout.name)}`, layout.fields, {
            _layout: { type: new GraphQLNonNull(GraphQLString) },
          })!);
        }
        if (blockTypes.size === 0) return json;
        const union = new GraphQLUnionType({
          name: claim(`${typeName}Block`),
          types: [...blockTypes.values()],
          resolveType: (v: any) => blockTypes.get(v?._layout)?.name,
        });
        newTypes.push(union);
        return {
          type: new GraphQLList(new GraphQLNonNull(union)),
          description,
          resolve: (p) => { const v = get(p); return Array.isArray(v) ? v.filter((i) => i && blockTypes.has(i._layout)) : null; },
        };
      }
    }
  };

  const dataFields = (prefix: string, ct: ContentTypeRow): GraphQLFieldConfigMap<any, any> => {
    const map: GraphQLFieldConfigMap<any, any> = {};
    const schema = Array.isArray(ct.schema) ? (ct.schema as FieldDef[]) : [];
    for (const f of schema) {
      if (!usable(f)) continue;
      const get = (p: any) => p.values?.[f.name];
      const description = f.description || f.label || undefined;
      switch (f.type) {
        case 'relation': {
          const rel = f as RelationFieldDef;
          const target = entryTypes.get(rel.options?.relatedContentType);
          if (!target && !isReverseRelation(rel)) {
            map[f.name] = valueField(rel, get);
            break;
          }
          if (!target) break; // reverse field to a type that isn't in the schema
          map[f.name] = {
            type: rel.options.cardinality === 'many' || (isReverseRelation(rel) && rel.options.cardinality !== 'one')
              ? new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(target)))
              : target,
            description: isReverseRelation(rel)
              ? `${description ?? f.name} — the ${rel.options.relatedContentType} entries whose "${rel.options.mappedBy}" links here (newest 100).`
              : description,
            resolve: (p, _args, ctx) => resolvers.relation(p.entry, ct.name, rel, ctx),
          };
          break;
        }
        case 'group':
        case 'repeater':
        case 'flexible':
          map[f.name] = containerField(`${prefix}${pascal(f.name)}`, f, get);
          break;
        default:
          map[f.name] = valueField(f as SimpleFieldDef, get);
      }
    }
    return map;
  };

  for (const { ct, typeName } of planned) {
    entryTypes.set(
      ct.name,
      new GraphQLObjectType({
        name: typeName,
        description: ct.displayName || undefined,
        fields: () => {
          const data = dataFields(typeName, ct);
          const dataType = Object.keys(data).length
            ? new GraphQLObjectType({ name: `${typeName}Data`, fields: data })
            : null;
          if (dataType) newTypes.push(dataType);
          return {
            id: { type: new GraphQLNonNull(GraphQLID), description: 'The entry\'s publicId (what relation fields store).' },
            slug: { type: new GraphQLNonNull(GraphQLString) },
            locale: { type: new GraphQLNonNull(GraphQLString), description: 'The language served — the default one when a fallback was used.' },
            createdAt: { type: new GraphQLNonNull(GraphQLString), resolve: (e) => iso(e.createdAt) },
            updatedAt: { type: new GraphQLNonNull(GraphQLString), resolve: (e) => iso(e.updatedAt) },
            seo: { type: JSONScalar },
            data: dataType
              ? { type: new GraphQLNonNull(dataType), resolve: (e) => ({ entry: e, values: e.data ?? {} }) }
              : { type: JSONScalar, resolve: (e) => e.data ?? {} },
          };
        },
      }),
    );
  }

  const queryFields: GraphQLFieldConfigMap<any, any> = {};
  for (const { ct, typeName, single, list } of planned) {
    const type = entryTypes.get(ct.name)!;
    const allowed = methods(ct);
    const localeArgs = {
      locale: { type: GraphQLString, description: 'Language code. Default: the default language.' },
      fallback: { type: GraphQLBoolean, description: 'Serve the default language where there is no translation.' },
    };
    queries[ct.name] = {};
    if (!allowed || allowed.includes('read')) {
      queries[ct.name].single = single;
      queryFields[single] = {
        type,
        description: `A published ${ct.displayName || ct.name} by slug.`,
        args: { slug: { type: new GraphQLNonNull(GraphQLString) }, ...localeArgs },
        resolve: (_src, args, ctx) => resolvers.single(ct.name, args, ctx),
      };
    }
    if (!allowed || allowed.includes('list')) {
      const listType = new GraphQLObjectType({
        name: `${typeName}List`,
        fields: {
          data: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(type))) },
          meta: { type: new GraphQLNonNull(ListMeta) },
        },
      });
      newTypes.push(listType);
      queries[ct.name].list = list;
      queryFields[list] = {
        type: new GraphQLNonNull(listType),
        description: `Published ${ct.displayName || ct.name} entries — the same filters as GET /api/${contentTypePath(ct.name)}.`,
        args: {
          ...localeArgs,
          where: { type: JSONScalar, description: 'Same shape as ?where[...] — e.g. { "price": { "gte": 10 }, "author": { "slug": { "eq": "jane" } } }.' },
          search: { type: GraphQLString },
          sort: { type: GraphQLString, description: '"createdAt:desc" (default), "updatedAt:asc", "slug:asc"…' },
          page: { type: GraphQLInt },
          limit: { type: GraphQLInt, description: '1–100, default 20.' },
          cursor: { type: GraphQLString, description: 'meta.nextCursor of the previous page (instead of page).' },
        },
        resolve: (_src, args, ctx) => resolvers.list(ct.name, args, ctx),
      };
    }
  }

  // Entry types are built lazily (their fields are thunks); touch them so every
  // nested type exists before the schema collects types.
  for (const t of entryTypes.values()) t.getFields();

  const cfg = base.toConfig();
  const query = new GraphQLObjectType({
    ...baseQuery.toConfig(),
    fields: { ...baseQuery.toConfig().fields, ...queryFields },
  });
  const schema = new GraphQLSchema({
    ...cfg,
    query,
    types: [...cfg.types.filter((t) => t.name !== baseQuery.name), ...entryTypes.values(), ...newTypes],
  });
  const errors = validateSchema(schema);
  if (errors.length) throw new Error(`Typed GraphQL schema is invalid: ${errors.map((e) => e.message).join('; ')}`);
  return { schema, skipped, queries };
}

