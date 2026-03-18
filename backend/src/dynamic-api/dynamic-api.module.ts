import { Module } from '@nestjs/common';
import { DynamicApiController } from './dynamic-api.controller';
import { DynamicApiService } from './dynamic-api.service';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [ApiKeysModule],
  controllers: [DynamicApiController],
  providers: [DynamicApiService],
})
export class DynamicApiModule {}
