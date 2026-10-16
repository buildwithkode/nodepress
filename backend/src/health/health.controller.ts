import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { statSync } from 'fs';
import { getHeapStatistics } from 'v8';
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
        const heapUsedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        // Report down only when the heap is close to V8's real limit (which follows
        // --max-old-space-size / container memory), not at a fixed size — a fixed
        // 512 MB made busy-but-healthy replicas fail load-balancer checks.
        // HEALTH_MAX_HEAP_MB overrides the threshold.
        const limitMB = Math.round(getHeapStatistics().heap_size_limit / 1024 / 1024);
        const threshold = Number(process.env.HEALTH_MAX_HEAP_MB) || Math.round(limitMB * 0.9);
        return {
          memory: {
            status: (heapUsedMB < threshold ? 'up' : 'down') as 'up' | 'down',
            heapUsedMB,
            thresholdMB: threshold,
          },
        };
      },

    ]);
  }
}
