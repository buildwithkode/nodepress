import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Runs one job. Throw to have it retried (with backoff) until maxAttempts. */
export type JobHandler = (payload: any, job: ClaimedJob) => Promise<void>;

export interface ClaimedJob {
  id: number;
  type: string;
  payload: any;
  attempts: number; // already includes the current attempt
  maxAttempts: number;
}

export interface EnqueueOptions {
  maxAttempts?: number;
  delayMs?: number;
}

/** Backoff after a failed attempt, indexed by the attempt that failed (1 → 1 min, 2 → 10 min, …). */
const RETRY_DELAYS_MS = [0, 60_000, 10 * 60_000, 60 * 60_000];

/** How long a claimed job is reserved for its worker. Handlers should time out well before this. */
export const JOB_LEASE_MS = 2 * 60_000;

/**
 * Durable background jobs in the `jobs` table.
 *
 * Producers call `enqueue(type, payload)`; a module that owns a job type
 * registers its handler with `registerHandler(type, fn)` (typically in
 * onModuleInit). JobWorker on every instance claims due jobs with
 * FOR UPDATE SKIP LOCKED and runs them through `process()`.
 *
 * Payloads are snapshots: store everything the handler needs, since the
 * source records may change before the job runs.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private enqueueListener?: () => void;

  constructor(private readonly prisma: PrismaService) {}

  registerHandler(type: string, handler: JobHandler) {
    if (this.handlers.has(type)) throw new Error(`Job handler "${type}" is already registered`);
    this.handlers.set(type, handler);
  }

  /** Called after jobs are queued, so a local worker can start at once instead of on its next poll. */
  onEnqueue(listener: () => void) {
    this.enqueueListener = listener;
  }

  async enqueue(type: string, payload: Record<string, any>, options: EnqueueOptions = {}): Promise<number> {
    return this.enqueueMany([{ type, payload }], options);
  }

  /** Queue several jobs in one insert. Returns how many were queued. */
  async enqueueMany(jobs: { type: string; payload: Record<string, any> }[], options: EnqueueOptions = {}): Promise<number> {
    if (jobs.length === 0) return 0;
    const runAt = new Date(Date.now() + (options.delayMs ?? 0));
    const { count } = await this.prisma.job.createMany({
      data: jobs.map((j) => ({
        type: j.type,
        payload: j.payload as Prisma.InputJsonValue,
        maxAttempts: options.maxAttempts ?? 3,
        runAt,
      })),
    });
    this.enqueueListener?.();
    return count;
  }

  /**
   * Atomically claim up to `limit` due jobs. The attempt is counted and `runAt`
   * becomes the lease: if the worker dies, the job is due again once it expires.
   */
  async claimDue(limit: number): Promise<ClaimedJob[]> {
    if (limit <= 0) return [];
    return this.prisma.$queryRaw<ClaimedJob[]>`
      UPDATE "jobs" j
      SET "attempts" = j."attempts" + 1,
          "runAt" = (now() AT TIME ZONE 'UTC') + make_interval(secs => ${JOB_LEASE_MS / 1000}),
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE j."id" IN (
        SELECT "id" FROM "jobs"
        WHERE "status" = 'pending' AND "attempts" < "maxAttempts"
          AND "runAt" <= (now() AT TIME ZONE 'UTC')
        ORDER BY "runAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING j."id", j."type", j."payload", j."attempts", j."maxAttempts"`;
  }

  /** Fail jobs whose worker died during their last allowed attempt. */
  async failAbandoned(): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE "jobs"
      SET "status" = 'failed', "lastError" = COALESCE("lastError", 'Job interrupted'),
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE "status" = 'pending' AND "attempts" >= "maxAttempts"
        AND "runAt" <= (now() AT TIME ZONE 'UTC')`;
  }

  /** Run one claimed job and record the outcome. Never throws. */
  async process(job: ClaimedJob): Promise<void> {
    try {
      const handler = this.handlers.get(job.type);
      if (!handler) {
        await this.finish(job.id, 'failed', `No handler registered for job type "${job.type}"`);
        return;
      }
      try {
        await handler(job.payload, job);
        await this.finish(job.id, 'done', null);
      } catch (err: any) {
        await this.retryOrFail(job, err?.message ?? String(err));
      }
    } catch (err: any) {
      // DB error recording the outcome: the lease expires and the job runs again.
      this.logger.error(`Job #${job.id} (${job.type}) bookkeeping failed: ${err?.message}`);
    }
  }

  private async retryOrFail(job: ClaimedJob, error: string) {
    if (job.attempts >= job.maxAttempts) {
      this.logger.warn(`Job #${job.id} (${job.type}) failed after ${job.attempts} attempts: ${error}`);
      await this.finish(job.id, 'failed', error);
      return;
    }
    const delay = RETRY_DELAYS_MS[job.attempts] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    this.logger.warn(`Job #${job.id} (${job.type}) attempt ${job.attempts} failed: ${error} — retrying in ${delay / 1000}s`);
    await this.prisma.job.update({
      where: { id: job.id },
      data: { lastError: error, runAt: new Date(Date.now() + delay) },
    });
  }

  private async finish(id: number, status: 'done' | 'failed', lastError: string | null) {
    await this.prisma.job.update({ where: { id }, data: { status, lastError } });
  }
}
