import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { GraphQLSchema } from 'graphql';
import { PrismaService } from '../prisma/prisma.service';
import { DynamicApiService } from '../dynamic-api/dynamic-api.service';
import { populateManyDeep } from '../common/populate.util';
import { normalizeDataKeys, injectRepeaterIds, needsRepeaterIds } from '../common/normalize';
import { filterUnauthorizedReadFields } from '../common/field-security.util';
import { FieldDef, RelationFieldDef } from '../fields/field.types';
import { buildContentSchema, ContentResolvers, ContentTypeRow, PublicEntry } from './content-schema';

type SchemaListener = (ctx: { apiSchema: GraphQLSchema; coreSupergraphSdl: string }) => void;

/** How often each instance checks for content type changes made elsewhere. */
const POLL_MS = Number(process.env.GRAPHQL_SCHEMA_POLL_MS) || 10_000;

const WRITES = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn', 'upsert', 'delete', 'deleteMany']);

/**
 * Serves the typed content GraphQL schema (see content-schema.ts) next to the
 * code-first one, and swaps it in when content types change.
 *
 * Apollo can only replace a schema through its gateway interface, so this
 * service *is* the gateway: GraphQLModule hands it the code-first schema
 * (transformSchema) and Apollo asks it for the schema to serve. A content type
 * write in this process rebuilds at once; other instances notice within
 * GRAPHQL_SCHEMA_POLL_MS (a count + max(updatedAt) query).
 */
@Injectable()
export class ContentGraphqlService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ContentGraphqlService.name);
  private base?: GraphQLSchema;
  private current?: GraphQLSchema;
  private readonly listeners = new Set<SchemaListener>();
  private schemas = new Map<string, FieldDef[]>();
  private fingerprint = '';
  private timer?: NodeJS.Timeout;
  private rebuilding?: Promise<void>;
  private readonly batches = new WeakMap<object, Map<string, Batch>>();

  constructor(private readonly prisma: PrismaService, private readonly moduleRef: ModuleRef) {}

  /** GraphQLModule `transformSchema`: remember the code-first schema. */
  captureBase = (schema: GraphQLSchema): GraphQLSchema => {
    this.base = schema;
    return schema;
  };

  /** Apollo's GatewayInterface — the schema Apollo serves comes from here. */
  readonly gateway = {
    load: async () => {
      this.publish(this.current ?? this.base!);
      return { schema: this.current ?? this.base!, executor: null };
    },
    onSchemaLoadOrUpdate: (cb: SchemaListener) => {
      this.listeners.add(cb);
      return () => this.listeners.delete(cb);
    },
    stop: async () => {},
  };

  async onApplicationBootstrap() {
    if (typeof this.prisma.onOperation === 'function') {
      this.prisma.onOperation(async (params, next) => {
        const result = await next(params);
        if (params.model === 'ContentType' && WRITES.has(params.action)) await this.refresh();
        return result;
      });
    }
    await this.refresh();
    this.timer = setInterval(() => void this.refreshIfChanged(), POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** The schema being served (base until the first build). */
  get schema(): GraphQLSchema | undefined {
    return this.current ?? this.base;
  }

  async refresh(): Promise<void> {
    // Serialize rebuilds; a write during one triggers another.
    const run = (this.rebuilding ?? Promise.resolve()).then(() => this.rebuild());
    this.rebuilding = run.catch(() => {});
    return run;
  }

  private async refreshIfChanged() {
    try {
      if ((await this.currentFingerprint()) !== this.fingerprint) await this.refresh();
    } catch (err: any) {
      this.logger.warn(`Content type check failed: ${err?.message}`);
    }
  }

  private async currentFingerprint() {
    const agg = await this.prisma.contentType.aggregate({ _count: { _all: true }, _max: { updatedAt: true } });
    return `${agg._count._all}:${agg._max.updatedAt?.toISOString() ?? ''}`;
  }

  private async rebuild() {
    if (!this.base) return;
    try {
      const fingerprint = await this.currentFingerprint();
      const rows = await this.prisma.contentType.findMany({
        select: { name: true, displayName: true, schema: true, allowedMethods: true },
        orderBy: { id: 'asc' },
      });
      const built = buildContentSchema(this.base, rows as ContentTypeRow[], this.resolvers);
      for (const s of built.skipped) this.logger.warn(`GraphQL: content type "${s.name}" left out — ${s.reason}`);
      this.schemas = new Map(rows.map((r) => [r.name, (Array.isArray(r.schema) ? r.schema : []) as unknown as FieldDef[]]));
      this.fingerprint = fingerprint;
      this.current = built.schema;
      this.publish(built.schema);
    } catch (err: any) {
      // Keep serving the previous schema.
      this.logger.error(`Typed GraphQL schema rebuild failed: ${err?.message}`);
    }
  }

  private publish(schema: GraphQLSchema) {
    for (const cb of this.listeners) cb({ apiSchema: schema, coreSupergraphSdl: '' });
  }

  private dynamic(): DynamicApiService {
    // Resolved lazily: importing DynamicApiModule here would register its
    // wildcard routes before the static ones.
    return this.moduleRef.get(DynamicApiService, { strict: false });
  }

  private readonly resolvers: ContentResolvers = {
    list: (type, args) =>
      this.dynamic().findAll(type, {
        locale: args.locale ?? undefined,
        fallback: args.fallback ?? undefined,
        where: args.where ?? undefined,
        search: args.search ?? undefined,
        sort: args.sort ?? undefined,
        page: args.page ?? undefined,
        limit: args.limit ?? undefined,
        cursor: args.cursor ?? undefined,
      }),
    single: async (type, args) => {
      try {
        return await this.dynamic().findOne(type, args.slug, { locale: args.locale ?? undefined, fallback: args.fallback ?? undefined });
      } catch (err) {
        if (err instanceof NotFoundException) return null;
        throw err;
      }
    },
    relation: (owner, ownerType, field, ctx) =>
      this.batch(ctx, `${ownerType}.${field.name}`, owner, (owners) => this.loadRelation(owners, ownerType, field)),
  };

  /** One query (per depth) for a relation field across every entry in the response. */
  private async loadRelation(
    owners: PublicEntry[],
    ownerType: string,
    field: RelationFieldDef,
  ): Promise<Array<PublicEntry | PublicEntry[] | null>> {
    const schema = this.schemas.get(ownerType) ?? [];
    const readRoles = (field as any).readRoles ?? (field as any).options?.readRoles;
    const many = field.options.cardinality === 'many' || (!!field.options.mappedBy && field.options.cardinality !== 'one');
    if (Array.isArray(readRoles) && readRoles.length) return owners.map(() => (many ? [] : null));

    const populated = await populateManyDeep(
      owners.map((o) => o.data ?? {}),
      schema,
      [field.name],
      this.prisma,
      0,
      { publishedOnly: true, ownerIds: owners.map((o) => o.id) },
    );
    return populated.map((data) => {
      const v = data?.[field.name];
      if (Array.isArray(v)) return v.filter((r) => r && typeof r === 'object').map(toPublic);
      if (v && typeof v === 'object') return many ? [toPublic(v)] : toPublic(v);
      return many ? [] : null;
    });
  }

  /** Collect calls made in the same tick of one request and run them together. */
  private batch<K, V>(ctx: object, key: string, item: K, run: (items: K[]) => Promise<V[]>): Promise<V> {
    const scope = ctx && typeof ctx === 'object' ? ctx : {};
    let perRequest = this.batches.get(scope);
    if (!perRequest) this.batches.set(scope, (perRequest = new Map()));
    let batch = perRequest.get(key);
    if (!batch) {
      const b: Batch = { items: [], waiters: [] };
      batch = b;
      perRequest.set(key, b);
      const map = perRequest;
      setImmediate(async () => {
        map.delete(key);
        try {
          const out = await run(b.items as K[]);
          b.waiters.forEach((w, i) => w.resolve(out[i]));
        } catch (err) {
          b.waiters.forEach((w) => w.reject(err));
        }
      });
    }
    const target = batch;
    return new Promise<V>((resolve, reject) => {
      target.items.push(item);
      target.waiters.push({ resolve, reject });
    });
  }
}

interface Batch {
  items: unknown[];
  waiters: Array<{ resolve: (v: any) => void; reject: (e: unknown) => void }>;
}

/** A populated row (Prisma shape, contentType included) → the public entry shape. */
function toPublic(row: any): PublicEntry {
  let data = normalizeDataKeys((row.data ?? {}) as Record<string, any>);
  if (needsRepeaterIds(data)) data = injectRepeaterIds(data);
  data = filterUnauthorizedReadFields(data, (row.contentType?.schema ?? []) as FieldDef[], undefined);
  return {
    id: row.publicId,
    slug: row.slug,
    locale: row.locale,
    seo: row.seo ?? null,
    data,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
