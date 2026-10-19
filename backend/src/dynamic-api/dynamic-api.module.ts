import { Module } from '@nestjs/common';
import { DynamicApiController } from './dynamic-api.controller';
import { DynamicApiService } from './dynamic-api.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthModule } from '../auth/auth.module';
import { AppCacheModule } from '../cache/cache.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CdnModule } from '../cdn/cdn.module';
import { StageAccessGuard } from './stage-access.guard';

@Module({
  imports: [ApiKeysModule, AuthModule, AppCacheModule, RealtimeModule, CdnModule],
  controllers: [DynamicApiController],
  providers: [DynamicApiService, StageAccessGuard],
})
export class DynamicApiModule {}
