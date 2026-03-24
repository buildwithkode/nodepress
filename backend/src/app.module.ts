import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),

    PrismaModule,
    AuthModule,
    AuditModule,        // Global — AuditService available everywhere without re-importing
    WebhooksModule,     // Global — WebhooksService available everywhere without re-importing
    UsersModule,
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
  ],
})
export class AppModule {}
