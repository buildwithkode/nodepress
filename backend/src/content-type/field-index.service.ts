import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { INDEXABLE_FIELD_TYPES } from '../fields/field.types';


/** Field names are validated as /^[a-z_][a-z0-9_]*$/ — re-checked before any SQL. */
const SAFE_NAME = /^[a-z_][a-z0-9_]*$/;
const PG_MAX_IDENT = 63;

/** Index name prefix for one content type — `entries_f_<id>_`. */
export const fieldIndexPrefix = (contentTypeId: number) => `entries_f_${contentTypeId}_`;

export function fieldIndexName(contentTypeId: number, field: string): string {
  const name = `${fieldIndexPrefix(contentTypeId)}${field}`;
  if (name.length <= PG_MAX_IDENT) return name;
  // Keep it unique when truncating: short stable hash of the full field name.
  let h = 0;
  for (const ch of field) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const suffix = `_${h.toString(36)}`;
  return name.slice(0, PG_MAX_IDENT - suffix.length) + suffix;
}

/** Top-level fields marked `indexed: true` that can be indexed. */
export function indexedFieldNames(schema: any[]): string[] {
  return (schema ?? [])
    .filter((f) => f?.indexed === true && INDEXABLE_FIELD_TYPES.has(f.type) && SAFE_NAME.test(f.name))
    .map((f) => f.name as string);
}

/**
 * Keeps one partial expression index per `indexed` field:
 *
 *   CREATE INDEX entries_f_<ct>_<field> ON entries (("data" #> '{<field>}'))
 *   WHERE "contentTypeId" = <ct>
 *
 * The expression matches the SQL Prisma generates for JSON path filters
 * (`?where[field][eq]=…`, gt/lt/…), so Postgres uses it once it plans with the
 * bound values — the default for Prisma's queries. Without it, filtering on a
 * custom field scans every entry of the content type.
 *
 * Indexes are built CONCURRENTLY in the background so saving a schema never
 * blocks writes, even on large tables.
 */
@Injectable()
export class FieldIndexService {
  private readonly logger = new Logger(FieldIndexService.name);

  constructor(private prisma: PrismaService) {}

  /** Create/drop indexes so they match the schema. Never throws. */
  async sync(contentTypeId: number, schema: any[]): Promise<void> {
    try {
      const wanted = new Map(indexedFieldNames(schema).map((f) => [fieldIndexName(contentTypeId, f), f]));
      const existing = await this.existing(contentTypeId);

      for (const { name, valid } of existing) {
        if (!wanted.has(name) || !valid) {
          await this.prisma.$executeRawUnsafe(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
          if (!wanted.has(name)) this.logger.log(`Dropped field index ${name}`);
        }
      }

      const present = new Set(existing.filter((e) => e.valid).map((e) => e.name));
      for (const [name, field] of wanted) {
        if (present.has(name)) continue;
        const started = Date.now();
        await this.prisma.$executeRawUnsafe(
          `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${name}" ON "entries" (("data" #> '{${field}}')) ` +
            `WHERE "contentTypeId" = ${Number(contentTypeId)}`,
        );
        this.logger.log(`Built field index ${name} in ${Date.now() - started} ms`);
      }
    } catch (err: any) {
      this.logger.error(`Field index sync failed for content type #${contentTypeId}: ${err?.message}`);
    }
  }

  /** Drop every field index of a content type (used when it is deleted). */
  async dropAll(contentTypeId: number): Promise<void> {
    await this.sync(contentTypeId, []);
  }

  private async existing(contentTypeId: number): Promise<{ name: string; valid: boolean }[]> {
    const prefix = fieldIndexPrefix(contentTypeId);
    return this.prisma.$queryRaw<{ name: string; valid: boolean }[]>`
      SELECT c.relname AS name, i.indisvalid AS valid
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class t ON t.oid = i.indrelid
      WHERE t.relname = 'entries' AND starts_with(c.relname, ${prefix})`;
  }
}
