import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { env } from '../config/env';
import { QueueRunner } from '../common/queue-runner';
import { ClaimedJob, JobsService } from './jobs.service';

/**
 * Runs background jobs from the `jobs` table on every backend instance
 * (unless QUEUE_WORKER=false), at most JOB_CONCURRENCY at a time.
 */
@Injectable()
export class JobWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobWorker.name);
  private runner?: QueueRunner<ClaimedJob>;

  constructor(private readonly jobs: JobsService) {}

  onApplicationBootstrap() {
    if (env.QUEUE_WORKER === 'false') {
      this.logger.log('Job worker disabled (QUEUE_WORKER=false)');
      return;
    }
    this.runner = new QueueRunner(
      {
        claimDue: (limit) => this.jobs.claimDue(limit),
        process: (job) => this.jobs.process(job),
        failAbandoned: () => this.jobs.failAbandoned(),
      },
      { name: JobWorker.name, concurrency: env.JOB_CONCURRENCY, pollMs: env.QUEUE_POLL_MS },
    );
    this.jobs.onEnqueue(() => this.runner?.wake());
    this.runner.start();
  }

  async onModuleDestroy() {
    await this.runner?.stop();
  }
}
