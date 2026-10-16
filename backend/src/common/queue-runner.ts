import { Logger } from '@nestjs/common';

/** What a queue must provide for a QueueRunner to work it. */
export interface QueueSource<T> {
  /** Atomically claim (lease) up to `limit` due items — e.g. UPDATE … FOR UPDATE SKIP LOCKED. */
  claimDue(limit: number): Promise<T[]>;
  /** Process one claimed item. Must record its own outcome and never throw. */
  process(item: T): Promise<void>;
  /** Fail items whose worker died during their last allowed attempt. Returns how many. */
  failAbandoned(): Promise<number>;
}

export interface QueueRunnerOptions {
  name: string;
  concurrency: number;
  pollMs: number;
}

/** How often abandoned final attempts are swept (they're rare, so not every poll). */
const SWEEP_EVERY_MS = 60_000;
/** On shutdown, wait this long for in-flight items; unfinished ones are retried after their lease. */
const SHUTDOWN_GRACE_MS = 5_000;

/**
 * Polling loop for a database-backed queue.
 *
 * Keeps at most `concurrency` items in flight and claims more as slots free
 * up. Because claims are atomic, any number of instances can run a runner on
 * the same queue without coordination. It polls every `pollMs`, and `wake()`
 * starts a poll immediately (call it after queueing work on this instance).
 */
export class QueueRunner<T> {
  private readonly logger: Logger;
  private timer?: NodeJS.Timeout;
  private inFlight = 0;
  private polling = false;
  private pollAgain = false;
  private backlog = false;
  private stopping = true;
  private lastSweep = 0;

  constructor(
    private readonly source: QueueSource<T>,
    private readonly options: QueueRunnerOptions,
  ) {
    this.logger = new Logger(options.name);
  }

  start() {
    this.stopping = false;
    this.scheduleNext();
  }

  async stop() {
    this.stopping = true;
    clearTimeout(this.timer);
    const deadline = Date.now() + SHUTDOWN_GRACE_MS;
    while ((this.inFlight > 0 || this.polling) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  wake() {
    void this.poll();
  }

  /** Claim as many due items as there are free slots, and start them. */
  async poll(): Promise<void> {
    if (this.stopping) return;
    if (this.polling) {
      this.pollAgain = true;
      return;
    }
    this.polling = true;
    try {
      do {
        this.pollAgain = false;
        await this.sweepIfDue();
        const free = this.options.concurrency - this.inFlight;
        if (free <= 0) {
          this.backlog = true;
          break;
        }
        const claimed = await this.source.claimDue(free);
        // A full batch means more may be waiting: claim again as slots free up.
        this.backlog = claimed.length === free;
        for (const item of claimed) this.run(item);
      } while (this.pollAgain && !this.stopping);
    } catch (err: any) {
      this.logger.error(`Poll failed: ${err?.message}`);
    } finally {
      this.polling = false;
    }
  }

  private run(item: T) {
    this.inFlight++;
    this.source
      .process(item)
      .catch((err: any) => this.logger.error(`Processing failed: ${err?.message}`))
      .finally(() => {
        this.inFlight--;
        if (this.backlog) void this.poll();
      });
  }

  private async sweepIfDue() {
    if (Date.now() - this.lastSweep < SWEEP_EVERY_MS) return;
    this.lastSweep = Date.now();
    const failed = await this.source.failAbandoned();
    if (failed > 0) this.logger.warn(`Marked ${failed} interrupted item(s) as failed`);
  }

  private scheduleNext() {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      void this.poll().finally(() => this.scheduleNext());
    }, this.options.pollMs);
    this.timer.unref?.();
  }
}
