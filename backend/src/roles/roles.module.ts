import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';

/**
 * Global — RolesService.resolve() is needed by JwtStrategy, the realtime
 * gateway, the JWT-or-API-key guard, users and permissions.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
