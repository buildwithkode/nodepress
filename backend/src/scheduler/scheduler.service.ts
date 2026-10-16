import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { env } from '../config/env';

/** Finished background jobs are kept this long for inspection, then pruned. */
const DONE_JOB_RETENTION_DAYS = 7;
const FAILED_JOB_RETENTION_DAYS = 30;

/** Max entries promoted per run; the rest follow on the next minute. */
const PUBLISH_BATCH = 500;

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
   * Runs every minute on every instance. No lock is needed: each entry is
   * promoted with a conditional update (still a draft, still due), and Postgres
   * row locking lets exactly one instance win it, so its webhook fires once.
   *
   * (Session advisory locks are unsafe here: Prisma pools connections, so the
   * unlock can run on a different connection than the lock and leak it.)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledEntries() {
    const now = new Date();
    const due = await this.prisma.entry.findMany({
      where: { status: 'draft', deletedAt: null, publishAt: { lte: now } },
      select: { id: true, slug: true, contentTypeId: true },
      orderBy: { publishAt: 'asc' },
      take: PUBLISH_BATCH,
    });
    if (due.length === 0) return;

    let published = 0;
    for (const entry of due) {
      const { count } = await this.prisma.entry.updateMany({
        // contentTypeId lets the public-cache middleware clear just this type.
        where: { id: entry.id, contentTypeId: entry.contentTypeId, status: 'draft', deletedAt: null, publishAt: { lte: now } },
        data: { status: 'published', publishAt: null },
      });
      if (count === 0) continue; // another instance got it, or it was edited meanwhile

      published++;
      this.webhooks.fire('entry.updated', {
        id: entry.id,
        slug: entry.slug,
        status: 'published',
        scheduledPublish: true,
      });
    }

    if (published > 0) {
      this.logger.log(`Scheduler(publish): promoted ${published} entr${published === 1 ? 'y' : 'ies'} to published`);
    }
  }

  // ── Weekly maintenance ────────────────────────────────────────────────────────

  /**
   * Runs every Sunday at 03:00 UTC.
   * - Prunes AuditLog entries older than AUDIT_LOG_RETENTION_DAYS
   * - Deletes expired refresh tokens
   * - Prunes finished background jobs (done after 7 days, failed after 30)
   * All deletes are idempotent, so instances running it at the same time is harmless.
   */
  @Cron('0 3 * * 0')
  async weeklyMaintenance() {
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

    const day = 24 * 60 * 60 * 1000;
    const { count: jobsPruned } = await this.prisma.job.deleteMany({
      where: {
        OR: [
          { status: 'done', updatedAt: { lt: new Date(Date.now() - DONE_JOB_RETENTION_DAYS * day) } },
          { status: 'failed', updatedAt: { lt: new Date(Date.now() - FAILED_JOB_RETENTION_DAYS * day) } },
        ],
      },
    });
    if (jobsPruned > 0) {
      this.logger.log(`Maintenance: pruned ${jobsPruned} finished background jobs`);
    }
  }

  // Webhook retries are handled by WebhookWorker (webhooks/webhook-worker.service.ts).
}
