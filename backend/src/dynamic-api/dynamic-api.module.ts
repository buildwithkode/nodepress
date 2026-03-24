import { Module } from '@nestjs/common';
import { DynamicApiController } from './dynamic-api.controller';
import { DynamicApiService } from './dynamic-api.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthModule } from '../auth/auth.module';
import { AppCacheModule } from '../cache/cache.module';

@Module({
  imports: [ApiKeysModule, AuthModule, AppCacheModule],
  controllers: [DynamicApiController],
  providers: [DynamicApiService],
})
export class DynamicApiModule {}
