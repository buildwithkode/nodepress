import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ContentTypeModule } from './content-type/content-type.module';
import { EntriesModule } from './entries/entries.module';
import { MediaModule } from './media/media.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { DynamicApiModule } from './dynamic-api/dynamic-api.module';

@Module({
  // DynamicApiModule must be last — its wildcard /:type routes must not shadow static routes
  imports: [PrismaModule, AuthModule, ContentTypeModule, EntriesModule, MediaModule, ApiKeysModule, DynamicApiModule],
})
export class AppModule {}
