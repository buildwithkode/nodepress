import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { statSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../cache/app-cache.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaService,
    private cache: AppCacheService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'System health check — DB, cache, storage, and memory' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([

      // ── Database ──────────────────────────────────────────────────────────
      async (): Promise<HealthIndicatorResult> => {
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return { database: { status: 'up' } };
        } catch (err: any) {
          return { database: { status: 'down', error: err?.message } };
        }
      },

      // ── Cache / Redis ─────────────────────────────────────────────────────
      async (): Promise<HealthIndicatorResult> => {
        const redisConfigured = !!process.env.REDIS_URL;
        if (!redisConfigured) {
          return { cache: { status: 'up', driver: 'in-memory' } };
        }
        if (this.cache.isRedisConnected) {
          return { cache: { status: 'up', driver: 'redis' } };
        }
        // Redis was configured but failed to connect — degraded (using in-memory fallback)
        return { cache: { status: 'down', driver: 'in-memory-fallback', error: this.cache.lastRedisError } };
      },

      // ── File storage ──────────────────────────────────────────────────────
      async (): Promise<HealthIndicatorResult> => {
        if (process.env.STORAGE_DRIVER === 's3') {
          return { storage: { status: 'up', driver: 's3' } };
        }
        try {
          statSync(join(process.cwd(), 'uploads'));
          return { storage: { status: 'up', driver: 'local' } };
        } catch {
          return { storage: { status: 'down', driver: 'local', error: 'uploads/ directory not accessible' } };
        }
      },

      // ── Process memory ────────────────────────────────────────────────────
      async (): Promise<HealthIndicatorResult> => {
        const heapUsed = process.memoryUsage().heapUsed;
        const heapUsedMB = Math.round(heapUsed / 1024 / 1024);
        const threshold = 512; // MB — alert if heap exceeds 512 MB
        return {
          memory: {
            status: (heapUsedMB < threshold ? 'up' : 'down') as 'up' | 'down',
            heapUsedMB,
          },
        };
      },

    ]);
  }
}
