import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NODEPRESS_VERSION } from '../plugin/plugin.registry';
import { env } from '../config/env';
import { buildOpenApiDocument, OpenApiContentType } from './openapi.builder';

const WRITES = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn', 'upsert', 'delete', 'deleteMany']);

/**
 * Serves the generated content API document (openapi.builder.ts), cached.
 * A content type write in this process drops the cache at once; writes on
 * other instances are noticed by a count + max(updatedAt) fingerprint checked
 * on each request (one small aggregate query).
 */
@Injectable()
export class OpenApiService implements OnModuleInit {
  private cached?: { fingerprint: string; doc: Record<string, any> };
  private building?: Promise<Record<string, any>>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (typeof this.prisma.onOperation === 'function') {
      this.prisma.onOperation(async (params, next) => {
        const result = await next(params);
        if (params.model === 'ContentType' && WRITES.has(params.action)) this.cached = undefined;
        return result;
      });
    }
  }

  async document(): Promise<Record<string, any>> {
    const fingerprint = await this.fingerprint();
    if (this.cached?.fingerprint === fingerprint) return this.cached.doc;
    // Concurrent requests share one rebuild.
    this.building ??= this.build(fingerprint).finally(() => (this.building = undefined));
    return this.building;
  }

  private async build(fingerprint: string) {
    const rows = await this.prisma.contentType.findMany({
      select: { name: true, displayName: true, schema: true, allowedMethods: true },
      orderBy: { name: 'asc' },
    });
    const doc = buildOpenApiDocument(rows as OpenApiContentType[], { serverUrl: env.APP_URL, version: NODEPRESS_VERSION });
    this.cached = { fingerprint, doc };
    return doc;
  }

  private async fingerprint() {
    const agg = await this.prisma.contentType.aggregate({ _count: { _all: true }, _max: { updatedAt: true } });
    return `${agg._count._all}:${agg._max.updatedAt?.toISOString() ?? ''}`;
  }
}
