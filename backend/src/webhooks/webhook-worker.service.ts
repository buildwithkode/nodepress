import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { env } from '../config/env';
import { QueueRunner } from '../common/queue-runner';
import { WebhooksService } from './webhooks.service';

/**
 * Sends queued webhook deliveries from the `webhook_deliveries` table.
 *
 * Every backend instance runs one (unless QUEUE_WORKER=false), with at most
 * WEBHOOK_CONCURRENCY deliveries in flight. Claims use SKIP LOCKED, so
 * instances share the queue and capacity grows with the instance count.
 */
@Injectable()
export class WebhookWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WebhookWorker.name);
  private runner?: QueueRunner<any>;

  constructor(private readonly webhooks: WebhooksService) {}

  onApplicationBootstrap() {
    if (env.QUEUE_WORKER === 'false') {
      this.logger.log('Webhook worker disabled (QUEUE_WORKER=false)');
      return;
    }
    this.runner = new QueueRunner(
      {
        claimDue: (limit) => this.webhooks.claimDue(limit),
        process: (delivery) => this.webhooks.deliver(delivery),
        failAbandoned: () => this.webhooks.failAbandoned(),
      },
      { name: WebhookWorker.name, concurrency: env.WEBHOOK_CONCURRENCY, pollMs: env.QUEUE_POLL_MS },
    );
    this.webhooks.onEnqueue(() => this.runner?.wake());
    this.runner.start();
  }

  async onModuleDestroy() {
    await this.runner?.stop();
  }
}
