import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from '../prisma/prisma.module';
import { AppCacheModule } from '../cache/cache.module';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, PrismaModule, AppCacheModule],
  controllers: [HealthController],
})
export class HealthModule {}
