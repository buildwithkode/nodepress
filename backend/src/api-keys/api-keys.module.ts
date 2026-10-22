import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyGuard } from './api-key.guard';
import { JwtOrApiKeyGuard } from './jwt-or-api-key.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AppCacheModule } from '../cache/cache.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, AuthModule, AppCacheModule, PermissionsModule],
  providers: [ApiKeysService, ApiKeyGuard, JwtOrApiKeyGuard],
  controllers: [ApiKeysController],
  // PermissionsModule re-exported: JwtOrApiKeyGuard is instantiated in the modules that use it
  exports: [ApiKeysService, ApiKeyGuard, JwtOrApiKeyGuard, PermissionsModule],
})
export class ApiKeysModule {}
