// Copyright (c) 2026-present Karthik Paulraj / BuildWithKode
// Licensed under the MIT License. See LICENSE file in the project root for details.

import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ContentTypeModule } from './content-type/content-type.module';
import { EntriesModule } from './entries/entries.module';
import { MediaModule } from './media/media.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { FormsModule } from './forms/forms.module';
import { DynamicApiModule } from './dynamic-api/dynamic-api.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './audit/audit.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SeoModule } from './seo/seo.module';
import { AppCacheModule } from './cache/cache.module';
import { MetricsModule } from './metrics/metrics.module';
import { HttpMetricsInterceptor } from './metrics/http-metrics.interceptor';
import { ApiKeyRateLimitInterceptor } from './api-keys/api-key-rate-limit.interceptor';
import { PluginModule } from './plugin/plugin.module';
import { ENABLED_PLUGINS } from './plugin/plugins.config';
import { PermissionsModule } from './permissions/permissions.module';
import { GraphqlModule } from './graphql/graphql.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    // ── Structured JSON logging (pino) ─────────────────────────────────────
    // Logs every HTTP request with method, url, status, responseTime, requestId.
    // In production (NODE_ENV=production): pure JSON → pipe to Datadog/Loki/CloudWatch.
    // In development: pretty-printed via pino-pretty.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        // Generate a unique request ID for every request — returned in X-Request-Id response header.
        genReqId: (req, res) => {
          const existing = req.headers['x-request-id'];
          const id = existing
            ? String(existing)
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          res.setHeader('X-Request-Id', id);
          return id;
        },
        // Strip verbose/noisy fields from logs
        redact: {
          paths: ['req.headers.authorization', 'req.headers["x-api-key"]'],
          remove: true,
        },
        // In development: pretty-print with colours. In production: raw JSON.
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true, singleLine: true, ignore: 'pid,hostname' } }
          : undefined,
        // Don't log health check polls — they're noisy
        autoLogging: {
          ignore: (req) => req.url === '/api/health',
        },
      },
    }),

    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),

    AppCacheModule,     // Global — AppCacheService available everywhere without re-importing
    MetricsModule,      // Global — Prometheus metrics + GET /api/metrics endpoint
    PluginModule,       // Global — PluginRegistry + GET /api/plugins endpoint
    // Dynamically import enabled plugin NestJS modules so their routes/services/listeners are wired in
    ...ENABLED_PLUGINS.map((p) => p.module),
    PrismaModule,
    AuthModule,
    AuditModule,        // Global — AuditService available everywhere without re-importing
    WebhooksModule,     // Global — WebhooksService available everywhere without re-importing
    UsersModule,
    PermissionsModule,
    GraphqlModule,
    RealtimeModule,
    ContentTypeModule,
    EntriesModule,
    MediaModule,
    ApiKeysModule,
    FormsModule,
    HealthModule,
    SchedulerModule,    // Cron: auto-publishes entries when publishAt passes
    SeoModule,          // GET /sitemap.xml and GET /robots.txt

    // DynamicApiModule MUST be last — wildcard /:type routes shadow static routes
    DynamicApiModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiKeyRateLimitInterceptor,
    },
  ],
})
export class AppModule {}
