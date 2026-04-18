import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { env } from '../config/env';

/** Stable advisory lock ID for the scheduled-publish job (arbitrary unique integer). */
const PUBLISH_LOCK_ID = 7_734_982;

/** Stable advisory lock ID for the webhook-retry job. */
const RETRY_LOCK_ID = 7_734_983;

/** Stable advisory lock ID for the weekly maintenance job. */
const MAINTENANCE_LOCK_ID = 7_734_984;

/** Audit log retention period in days — configurable via AUDIT_LOG_RETENTION_DAYS env var (default 90). */
const AUDIT_RETENTION_DAYS = env.AUDIT_LOG_RETENTION_DAYS;

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
  ) {}

  // ── Scheduled publishing ─────────────────────────────────────────────────────

  /**
   * Runs every minute.
   * Uses pg_try_advisory_lock so only ONE instance fires when scaled horizontally.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledEntries() {
    const [{ acquired }] = await this.prisma.$queryRaw<[{ acquired: boolean }]>`
      SELECT pg_try_advisory_lock(${PUBLISH_LOCK_ID}::bigint) AS acquired
    `;

    if (!acquired) {
      this.logger.debug('Scheduler(publish): skipped — another instance holds the lock');
      return;
    }

    try {
      const due = await this.prisma.entry.findMany({
        where: { status: 'draft', deletedAt: null, publishAt: { lte: new Date() } },
        select: { id: true, slug: true, contentTypeId: true },
      });

      if (due.length === 0) return;

      this.logger.log(
        `Scheduler(publish): promoting ${due.length} entr${due.length === 1 ? 'y' : 'ies'} to published`,
      );

      await this.prisma.entry.updateMany({
        where: { id: { in: due.map((e) => e.id) } },
        data: { status: 'published', publishAt: null },
      });

      for (const entry of due) {
        this.webhooks.fire('entry.updated', {
          id: entry.id,
          slug: entry.slug,
          status: 'published',
          scheduledPublish: true,
        });
      }
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${PUBLISH_LOCK_ID}::bigint)`;
    }
  }

  // ── Weekly maintenance ────────────────────────────────────────────────────────

  /**
   * Runs every Sunday at 03:00 UTC.
   * - Prunes AuditLog entries older than 90 days
   * - Deletes expired refresh tokens
   * Uses pg_try_advisory_lock to prevent duplicate runs across instances.
   */
  @Cron('0 3 * * 0')
  async weeklyMaintenance() {
    const [{ acquired }] = await this.prisma.$queryRaw<[{ acquired: boolean }]>`
      SELECT pg_try_advisory_lock(${MAINTENANCE_LOCK_ID}::bigint) AS acquired
    `;
    if (!acquired) return;

    try {
      const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

      const { count: auditPruned } = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (auditPruned > 0) {
        this.logger.log(`Maintenance: pruned ${auditPruned} audit log entries older than ${AUDIT_RETENTION_DAYS} days`);
      }

      const { count: tokensPruned } = await (this.prisma as any).refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (tokensPruned > 0) {
        this.logger.log(`Maintenance: deleted ${tokensPruned} expired refresh tokens`);
      }
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${MAINTENANCE_LOCK_ID}::bigint)`;
    }
  }

  // ── Webhook retry queue ───────────────────────────────────────────────────────

  /**
   * Runs every minute. Picks up failed webhook deliveries and retries them
   * with exponential backoff (max 3 attempts total).
   * Uses pg_try_advisory_lock to prevent duplicate retries across instances.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async retryFailedWebhooks() {
    const [{ acquired }] = await this.prisma.$queryRaw<[{ acquired: boolean }]>`
      SELECT pg_try_advisory_lock(${RETRY_LOCK_ID}::bigint) AS acquired
    `;

    if (!acquired) {
      this.logger.debug('Scheduler(retry): skipped — another instance holds the lock');
      return;
    }

    try {
      const due = await (this.prisma as any).webhookDelivery.findMany({
        where: {
          status: 'pending',
          attempts: { lt: 3 },
          nextRetryAt: { lte: new Date() },
        },
        take: 50,
      });

      if (due.length === 0) return;

      this.logger.log(`Scheduler(retry): retrying ${due.length} webhook delivery/deliveries`);
      await this.webhooks.retryDeliveries(due);
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${RETRY_LOCK_ID}::bigint)`;
    }
  }
}
