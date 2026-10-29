import type { FieldCondition } from '../fields/field-condition';
import { FieldDef, FlexibleLayout, SimpleFieldDef, isReverseRelation } from '../fields/field.types';
import { filterUnauthorizedReadFields, validateFieldWritePermissions } from '../common/field-security.util';
import { pascal, plural } from '../graphql/content-schema';
import { contentTypePath } from '../common/content-type-name';

/**
 * OpenAPI 3.1 document for the content API (`/api/:type`, `/api/:type/:slug`):
 * one set of paths per content type and `components.schemas` built from its
 * fields — `<Type>` (the entry), `<Type>Data`, `<Type>Input` (create) and
 * `<Type>UpdateInput` (update: nothing required), `<Type>List`.
 *
 * It describes what an anonymous caller sees: fields hidden from public reads
 * (readRoles) are left out of the read schemas, fields the public write API
 * refuses (writeRoles) out of the inputs, and only the methods each type's
 * allowedMethods permits get an operation.
 *
 * Pure — no Nest, no database — so it can be rebuilt on every content type
 * change and unit-tested directly.
 */

export interface OpenApiContentType {
  name: string;
  displayName?: string | null;
  schema: unknown;
  allowedMethods?: unknown;
}

export interface OpenApiBuildOptions {
  /** Public base URL of the backend (APP_URL); the server is `<serverUrl>/api`. */
  serverUrl?: string;
  version?: string;
}

type Schema = Record<string, any>;
type Mode = 'read' | 'create' | 'update';

const METHODS = ['list', 'read', 'create', 'update', 'delete'] as const;
type Method = (typeof METHODS)[number];

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullable = (s: Schema): Schema => ({ oneOf: [s, { type: 'null' }] });
const UUID = { type: 'string', format: 'uuid' };

/** Methods a content type allows (null/absent allowedMethods = all of them). */
export function allowedMethodsOf(ct: OpenApiContentType): Set<Method> {
  if (!Array.isArray(ct.allowedMethods)) return new Set(METHODS);
  return new Set(METHODS.filter((m) => (ct.allowedMethods as string[]).includes(m)));
}

/** Top-level fields an anonymous read returns — the same check the read path runs. */
export function publicReadFields(schema: FieldDef[]): FieldDef[] {
  const probe = Object.fromEntries(schema.filter((f) => f?.name).map((f) => [f.name, true]));
  const visible = filterUnauthorizedReadFields(probe, schema, undefined);
  return schema.filter((f) => f?.name && f.name in visible);
}

/** Top-level fields the public write API accepts (no writeRoles, not a reverse relation). */
export function publicWriteFields(schema: FieldDef[]): FieldDef[] {
  return schema.filter((f) => {
    if (!f?.name || isReverseRelation(f)) return false;
    try {
      validateFieldWritePermissions({ [f.name]: true }, undefined, schema, undefined);
      return true;
    } catch {
      return false;
    }
  });
}

export function buildOpenApiDocument(contentTypes: OpenApiContentType[], opts: OpenApiBuildOptions = {}): Schema {
  const schemas: Record<string, Schema> = {};
  const paths: Record<string, Schema> = {};
  const tags: Array<{ name: string; description?: string }> = [];
  const operationIds = new Set<string>();

  const claim = (name: string) => {
    let n = name;
    for (let i = 2; n in schemas; i++) n = `${name}${i}`;
    schemas[n] = {};
    return n;
  };
  const opId = (id: string) => {
    let n = id;
    for (let i = 2; operationIds.has(n); i++) n = `${id}${i}`;
    operationIds.add(n);
    return n;
  };

  // ─── Shared components ─────────────────────────────────────────────────────
  Object.assign(schemas, {
    NodePressImage: {
      description: 'An image: the media URL, or `{ url, alt }`.',
      oneOf: [
        { type: 'string', format: 'uri' },
        {
          type: 'object',
          properties: { url: { type: 'string', format: 'uri' }, alt: { type: 'string' } },
          required: ['url'],
        },
      ],
    },
    NodePressPopulatedEntry: {
      description: 'A related entry inlined by `?populate=` (its `data` follows the related content type).',
      type: 'object',
      properties: {
        publicId: UUID,
        slug: { type: 'string' },
        locale: { type: 'string' },
        data: { type: 'object' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
      additionalProperties: true,
    },
    NodePressSeo: {
      type: ['object', 'null'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        image: { type: 'string' },
        noIndex: { type: 'boolean' },
      },
      additionalProperties: true,
    },
    NodePressListMeta: {
      type: 'object',
      description: 'With `?cursor=` only `limit` and `nextCursor` are returned (no total count).',
      properties: {
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        totalPages: { type: 'integer' },
        nextCursor: { type: ['string', 'null'], description: 'Pass as `cursor` for the next page; null on the last page.' },
        searchMode: { type: 'string', enum: ['fulltext', 'fallback'] },
      },
      required: ['limit'],
    },
    NodePressError: {
      type: 'object',
      properties: {
        statusCode: { type: 'integer' },
        message: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        error: { type: 'string' },
        errors: { type: 'array', items: { type: 'string' }, description: 'Per-field problems (422 data validation).' },
      },
      required: ['statusCode', 'message'],
    },
    NodePressDeleted: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  });

  // ─── Field → JSON Schema ───────────────────────────────────────────────────

  const conditionText = (c: FieldCondition): string => {
    const value = (v: unknown) => JSON.stringify(v);
    switch (c.op) {
      case 'eq': return `\`${c.field}\` is ${value(c.value)}`;
      case 'ne': return `\`${c.field}\` is not ${value(c.value)}`;
      case 'in': return `\`${c.field}\` is one of ${(c.value as unknown[]).map(value).join(', ')}`;
      case 'notIn': return `\`${c.field}\` is none of ${(c.value as unknown[]).map(value).join(', ')}`;
      case 'set': return `\`${c.field}\` has a value`;
      case 'notSet': return `\`${c.field}\` is empty`;
      default: return `\`${c.field}\` matches`;
    }
  };

  /** A field's value schema (not nullable — the caller wraps). */
  const fieldSchema = (field: FieldDef, mode: Mode, owner: string): Schema => {
    const description = field.description || field.label || undefined;
    const withDesc = (s: Schema): Schema => (description ? { ...s, description } : s);
    const opts: any = (field as any).options ?? {};
    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'richtext': {
        const s: Schema = { type: 'string' };
        if (field.type === 'richtext') s.contentMediaType = 'text/html';
        if (typeof opts.minLength === 'number') s.minLength = opts.minLength;
        if (typeof opts.maxLength === 'number') s.maxLength = opts.maxLength;
        if (typeof opts.pattern === 'string' && opts.pattern) s.pattern = opts.pattern;
        return withDesc(s);
      }
      case 'number': {
        const s: Schema = { type: opts.integer ? 'integer' : 'number' };
        if (typeof opts.min === 'number') s.minimum = opts.min;
        if (typeof opts.max === 'number') s.maximum = opts.max;
        return withDesc(s);
      }
      case 'boolean':
        return withDesc({ type: 'boolean' });
      case 'select': {
        const choices = Array.isArray(opts.choices) ? opts.choices.filter((c: unknown) => typeof c === 'string') : [];
        const one: Schema = choices.length ? { type: 'string', enum: choices } : { type: 'string' };
        return withDesc(opts.multiple ? { type: 'array', items: one } : one);
      }
      case 'image':
        return withDesc(ref('NodePressImage'));
      case 'color':
        return withDesc({ type: 'string', pattern: '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' });
      case 'date':
        return withDesc({ type: 'string', format: 'date' });
      case 'datetime':
        return withDesc({ type: 'string', format: 'date-time' });
      case 'json':
        return withDesc({ type: ['object', 'array'] });
      case 'relation': {
        const target = typeof opts.relatedContentType === 'string' ? opts.relatedContentType : 'entry';
        if (isReverseRelation(field)) {
          // Read-only, present only with ?populate=.
          const many = opts.cardinality !== 'one';
          const s = many ? { type: 'array', items: ref('NodePressPopulatedEntry') } : ref('NodePressPopulatedEntry');
          return {
            ...s,
            readOnly: true,
            description: `${description ? `${description} — ` : ''}${target} entries whose "${opts.mappedBy}" points here; only with ?populate=${field.name}.`,
          };
        }
        // Inside groups/repeaters/blocks relations stay ids; top-level ones can be populated.
        const one: Schema =
          mode === 'read' && owner === ''
            ? { oneOf: [UUID, ref('NodePressPopulatedEntry')] }
            : UUID;
        const s = opts.cardinality === 'many' ? { type: 'array', items: one } : one;
        return { ...s, description: `${description ? `${description} — ` : ''}publicId of a ${target} entry${mode === 'read' && owner === '' ? ` (the entry itself with ?populate=${field.name})` : ''}.` };
      }
      case 'repeater': {
        const items = objectSchema((opts.subFields ?? []) as FieldDef[], mode, `${owner}${field.name}.`, true);
        const s: Schema = { type: 'array', items };
        if (typeof opts.minItems === 'number') s.minItems = opts.minItems;
        if (typeof opts.maxItems === 'number') s.maxItems = opts.maxItems;
        return withDesc(s);
      }
      case 'group':
        return withDesc(objectSchema((opts.subFields ?? []) as FieldDef[], mode, `${owner}${field.name}.`, false));
      case 'flexible': {
        const layouts = (Array.isArray(opts.layouts) ? opts.layouts : []) as FlexibleLayout[];
        const mapping: Record<string, string> = {};
        const oneOf = layouts
          .filter((l) => l && typeof l.name === 'string')
          .map((l) => {
            const base = objectSchema((l.fields ?? []) as FieldDef[], mode, `${owner}${field.name}.`, true);
            const name = claim(`${currentType}${pascal(field.name)}${pascal(l.name)}${suffix(mode)}`);
            schemas[name] = {
              ...base,
              ...(l.label ? { title: l.label } : {}),
              properties: {
                _layout: { type: 'string', const: l.name },
                _key: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$', description: 'Optional section name, unique within the field' },
                ...base.properties,
              },
              required: ['_layout', ...(base.required ?? [])],
            };
            mapping[l.name] = `#/components/schemas/${name}`;
            return ref(name);
          });
        const items: Schema = oneOf.length
          ? { oneOf, discriminator: { propertyName: '_layout', mapping } }
          : { type: 'object', properties: { _layout: { type: 'string' } }, required: ['_layout'] };
        const s: Schema = { type: 'array', items };
        if (typeof opts.minItems === 'number') s.minItems = opts.minItems;
        if (typeof opts.maxItems === 'number') s.maxItems = opts.maxItems;
        return withDesc(s);
      }
      default:
        return withDesc({});
    }
  };

  /** An object of fields — entry data, a group, a repeater row or a flexible block. */
  const objectSchema = (fields: FieldDef[], mode: Mode, owner: string, rowIds: boolean): Schema => {
    const properties: Record<string, Schema> = {};
    const required: string[] = [];
    if (rowIds) properties._id = { type: 'string', description: 'Row id, assigned on save.' };
    for (const f of fields) {
      if (!f || typeof f.name !== 'string' || !f.name) continue;
      if (mode !== 'read' && isReverseRelation(f)) continue;
      const s = fieldSchema(f, mode, owner);
      // Absent, null and '' all count as "no value"; reverse fields are null-free arrays.
      properties[f.name] = isReverseRelation(f) ? s : nullable(s);
      if (f.condition) {
        // A conditional field is only shown — and only required — while its condition holds,
        // which JSON Schema can't say per field; describe it and keep it out of `required`.
        const shown = conditionText(f.condition);
        properties[f.name] = {
          ...properties[f.name],
          description: [properties[f.name].description, `Only used when ${shown}${f.required ? ' (then required)' : ''}.`].filter(Boolean).join(' — '),
          'x-nodepress-condition': f.condition,
        };
      } else if (mode === 'create' && f.required) {
        properties[f.name] = s;
        required.push(f.name);
      }
      // Public reads add the keyed sections of a top-level flexible field (common/section-keys.ts).
      const byKey = `${f.name}_by_key`;
      if (mode === 'read' && owner === '' && f.type === 'flexible' && !fields.some((x) => x?.name === byKey)) {
        properties[byKey] = {
          type: 'object',
          additionalProperties: (s as Schema).items ?? {},
          description: `The sections of ${f.name} that have a _key, by key. Read-only; ${f.name} keeps the order.`,
        };
      }
    }
    const out: Schema = { type: 'object', properties };
    if (required.length) out.required = required;
    return out;
  };

  const suffix = (mode: Mode) => (mode === 'read' ? '' : mode === 'create' ? 'Input' : 'UpdateInput');
  let currentType = '';

  // ─── Per content type ──────────────────────────────────────────────────────
  const sorted = [...contentTypes].sort((a, b) => a.name.localeCompare(b.name));
  for (const ct of sorted) {
    if (!ct?.name) continue;
    const methods = allowedMethodsOf(ct);
    if (!methods.size) continue;
    const schema = (Array.isArray(ct.schema) ? ct.schema : []) as FieldDef[];
    const P = pascal(ct.name) || 'Entry';
    const entryName = claim(P);
    currentType = entryName;
    const dataName = claim(`${entryName}Data`);
    const listName = claim(`${entryName}List`);
    const tag = ct.displayName && !tags.some((t) => t.name === ct.displayName) ? ct.displayName : ct.name;
    tags.push({ name: tag, description: `Entries of the "${ct.name}" content type.` });

    schemas[dataName] = { ...objectSchema(publicReadFields(schema), 'read', '', false), description: `Field values of a ${ct.name} entry. Plugins may add keys of their own.` };
    schemas[entryName] = {
      type: 'object',
      properties: {
        id: { ...UUID, description: 'The entry\'s publicId.' },
        slug: { type: 'string' },
        locale: { type: 'string' },
        data: ref(dataName),
        seo: ref('NodePressSeo'),
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
      required: ['id', 'slug', 'locale', 'data'],
    };
    schemas[listName] = {
      type: 'object',
      properties: { data: { type: 'array', items: ref(entryName) }, meta: ref('NodePressListMeta') },
      required: ['data', 'meta'],
    };

    let inputName: string | undefined;
    let updateName: string | undefined;
    const writable = publicWriteFields(schema);
    if (methods.has('create')) {
      inputName = claim(`${entryName}Input`);
      schemas[inputName] = { ...objectSchema(writable, 'create', '', false), description: `\`data\` for a new ${ct.name} entry.` };
    }
    if (methods.has('update')) {
      updateName = claim(`${entryName}UpdateInput`);
      schemas[updateName] = {
        ...objectSchema(writable, 'update', '', false),
        description: `\`data\` for an update. It replaces the stored data; required fields are not enforced.`,
      };
    }

    const base = `/${contentTypePath(ct.name)}`;
    const item = `${base}/{slug}`;
    const P2 = pascal(plural(ct.name)) === P ? `${P}List` : pascal(plural(ct.name));
    const readSecurity = [{}, { ApiKey: [] }, { bearerAuth: [] }];
    const writeSecurity = [{ ApiKey: [] }, { bearerAuth: [] }];
    const slugParam = { name: 'slug', in: 'path', required: true, schema: { type: 'string' } };

    if (methods.has('list') || methods.has('create')) paths[base] = {};
    if (methods.has('read') || methods.has('update') || methods.has('delete')) paths[item] = {};

    if (methods.has('list')) {
      paths[base].get = {
        tags: [tag],
        operationId: opId(`list${P2}`),
        summary: `List ${ct.name} entries`,
        description: 'Published entries, newest first. Unpublished stages (`stage`) need an API key or JWT.',
        security: readSecurity,
        parameters: listParameters(),
        responses: {
          '200': json(`A page of ${ct.name} entries`, ref(listName)),
          '400': errorResponse('Invalid query (bad cursor, filter or sort)'),
          '401': errorResponse('Credentials required for the requested stage'),
          '403': errorResponse('Method not allowed on this content type'),
          '404': errorResponse('Content type not found'),
        },
      };
    }
    if (methods.has('create')) {
      paths[base].post = {
        tags: [tag],
        operationId: opId(`create${P}`),
        summary: `Create a ${ct.name} entry`,
        security: writeSecurity,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
                  data: ref(inputName!),
                  locale: { type: 'string', description: 'BCP 47 locale (default "en").' },
                  status: { type: 'string', enum: ['draft', 'published'], default: 'published' },
                },
                required: ['slug', 'data'],
              },
            },
          },
        },
        responses: {
          '201': json('The created entry', ref(entryName)),
          ...writeErrors(),
          '409': errorResponse('Slug already exists in this locale'),
        },
      };
    }
    if (methods.has('read')) {
      paths[item].get = {
        tags: [tag],
        operationId: opId(`get${P}`),
        summary: `Get a ${ct.name} entry by slug`,
        description: 'The `Content-Language` response header says which translation was served.',
        security: readSecurity,
        parameters: [
          slugParam,
          { name: 'locale', in: 'query', schema: { type: 'string' }, description: 'Locale to fetch. Default: the configured default language.' },
          { name: 'fallback', in: 'query', schema: { type: 'boolean' }, description: 'Serve the default-language version when this locale has no translation.' },
          stageParam(),
          { name: 'populate', in: 'query', schema: { type: 'string' }, description: 'Comma-separated relation fields to inline; dot paths for nesting (author,author.company), up to 3 levels.' },
          { name: 'fields', in: 'query', schema: { type: 'string' }, description: 'Comma-separated data fields to return.' },
          envHeader(),
        ],
        responses: {
          '200': json(`The ${ct.name} entry`, ref(entryName)),
          '401': errorResponse('Credentials required for the requested stage'),
          '403': errorResponse('Method not allowed on this content type'),
          '404': errorResponse('Entry not found or not published'),
        },
      };
    }
    if (methods.has('update')) {
      paths[item].put = {
        tags: [tag],
        operationId: opId(`update${P}`),
        summary: `Update a ${ct.name} entry`,
        security: writeSecurity,
        parameters: [slugParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: ref(updateName!),
                  locale: { type: 'string', description: 'Locale of the entry to update (default "en").' },
                },
                required: ['data'],
              },
            },
          },
        },
        responses: {
          '200': json('The updated entry', ref(entryName)),
          ...writeErrors(),
          '404': errorResponse('Entry not found'),
        },
      };
    }
    if (methods.has('delete')) {
      paths[item].delete = {
        tags: [tag],
        operationId: opId(`delete${P}`),
        summary: `Delete a ${ct.name} entry (soft delete)`,
        security: writeSecurity,
        parameters: [slugParam, { name: 'locale', in: 'query', schema: { type: 'string' }, description: 'Default "en".' }],
        responses: {
          '200': json('Deleted', ref('NodePressDeleted')),
          '401': errorResponse('No or invalid credentials'),
          '403': errorResponse('Read-only key, key not scoped to this type, or method not allowed'),
          '404': errorResponse('Entry not found'),
        },
      };
    }
  }

  const server = (opts.serverUrl ?? '').replace(/\/+$/, '');
  return {
    openapi: '3.1.0',
    info: {
      title: 'NodePress Content API',
      version: opts.version ?? '1.0.0',
      description:
        'The REST API generated from this site\'s content types. Reads of published content are public; ' +
        'writes need an API key (`X-API-Key`, write or all access) or an admin JWT (`Authorization: Bearer`).',
    },
    servers: [{ url: `${server}/api` }],
    tags,
    paths,
    components: {
      schemas,
      securitySchemes: {
        ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'API key (np_…) — write or all access for writes.' },
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  };
}

// ─── Shared parameters & responses ───────────────────────────────────────────

function json(description: string, schema: Schema) {
  return { description, content: { 'application/json': { schema } } };
}

function errorResponse(description: string) {
  return json(description, ref('NodePressError'));
}

function writeErrors() {
  return {
    '400': errorResponse('Missing slug/data or invalid slug/status'),
    '401': errorResponse('No or invalid credentials'),
    '403': errorResponse('Read-only key, key not scoped to this type, protected field, or method not allowed'),
    '422': errorResponse('Data validation failed (see `errors`)'),
  };
}

function stageParam() {
  return {
    name: 'stage',
    in: 'query',
    schema: { type: 'string', enum: ['published', 'staging', 'draft', 'all'], default: 'published' },
    description: 'Anything but "published" needs an API key or JWT covering the type (responses are then private).',
  };
}

function envHeader() {
  return {
    name: 'X-NodePress-Environment',
    in: 'header',
    schema: { type: 'string', enum: ['staging', 'production'] },
    description: '"staging" acts like ?stage=staging.',
  };
}

function listParameters() {
  return [
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
    { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Keyset cursor from meta.nextCursor — faster than page for deep pages; skips the total count.' },
    { name: 'sort', in: 'query', schema: { type: 'string', default: 'createdAt:desc' }, description: 'field:direction — createdAt, updatedAt or slug; asc or desc.' },
    { name: 'fields', in: 'query', schema: { type: 'string' }, description: 'Comma-separated data fields to return.' },
    { name: 'populate', in: 'query', schema: { type: 'string' }, description: 'Comma-separated relation fields to inline; dot paths for nesting (author,author.company), up to 3 levels.' },
    { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Full-text search over the slug and all data.' },
    { name: 'locale', in: 'query', schema: { type: 'string' }, description: 'Only entries in this locale. Default: all locales.' },
    { name: 'fallback', in: 'query', schema: { type: 'boolean' }, description: 'With locale: also list default-language entries that have no translation in it.' },
    stageParam(),
    {
      name: 'where',
      in: 'query',
      style: 'deepObject',
      explode: true,
      schema: { type: 'object', additionalProperties: true },
      description:
        'Filters as where[field][operator]=value. Operators: eq, ne, gt, gte, lt, lte, contains, startsWith, endsWith, ' +
        'in, notIn (comma-separated), null, notNull. Combine with where[OR][0][field][op]=… / where[AND][…]. ' +
        'Relation fields filter on the related entry: where[author][slug][eq]=jane. `filters` is an alias.',
    },
    envHeader(),
  ];
}
