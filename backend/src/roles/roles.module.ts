import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { AccessService } from './access.service';

/**
 * Global — RolesService.resolve() is needed by JwtStrategy, the realtime
 * gateway, the JWT-or-API-key guard, users and permissions; AccessService by
 * RolesGuard, which every module uses.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [RolesController],
  providers: [RolesService, AccessService],
  exports: [RolesService, AccessService],
})
export class RolesModule {}
