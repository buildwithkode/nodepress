import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyGuard } from './api-key.guard';
import { JwtOrApiKeyGuard } from './jwt-or-api-key.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AppCacheModule } from '../cache/cache.module';

@Module({
  imports: [PrismaModule, AuthModule, AppCacheModule],
  providers: [ApiKeysService, ApiKeyGuard, JwtOrApiKeyGuard],
  controllers: [ApiKeysController],
  exports: [ApiKeysService, ApiKeyGuard, JwtOrApiKeyGuard],
})
export class ApiKeysModule {}
