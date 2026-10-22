import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenApiController } from './openapi.controller';
import { OpenApiService } from './openapi.service';

/** GET /api/openapi.json — the per-content-type REST API as OpenAPI 3.1. */
@Module({
  imports: [PrismaModule],
  controllers: [OpenApiController],
  providers: [OpenApiService],
  exports: [OpenApiService],
})
export class OpenApiModule {}
