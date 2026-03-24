import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
  ) {}

  /**
   * Runs every minute. Finds draft entries whose publishAt is in the past
   * and promotes them to published, then fires a webhook event.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledEntries() {
    const due = await this.prisma.entry.findMany({
      where: {
        status: 'draft',
        deletedAt: null,
        publishAt: { lte: new Date() },
      },
      select: { id: true, slug: true, contentTypeId: true },
    });

    if (due.length === 0) return;

    this.logger.log(`Scheduled publisher: promoting ${due.length} entr${due.length === 1 ? 'y' : 'ies'} to published`);

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
  }
}
