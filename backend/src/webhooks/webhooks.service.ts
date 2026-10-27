import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { env } from '../config/env';
import { outboundPost } from '../common/outbound-post';
import { AppCacheService } from '../cache/app-cache.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

export type WebhookEvent =
  | 'entry.created'
  | 'entry.updated'
  | 'entry.deleted'
  | 'entry.restored'
  | 'entry.purged'
  | 'entry.staged'
  | 'entry.published'
  | 'entry.promoted'
  | 'release.published'
  | 'media.uploaded'
  | 'media.deleted'
  | '*';

/** Delay before each retry attempt (ms): attempt 1 = immediate, 2 = 5 min, 3 = 30 min */
const RETRY_DELAYS_MS = [0, 5 * 60_000, 30 * 60_000];
export const MAX_ATTEMPTS = 3;

/** How long a claimed delivery is reserved for its worker (well above the 10 s send timeout). */
export const DELIVERY_LEASE_MS = 60_000;

const ENABLED_HOOKS_KEY = 'webhooks:enabled';
const ENABLED_HOOKS_TTL = 30_000;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private enqueueListener?: () => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async create(dto: CreateWebhookDto) {
    const hook = await this.prisma.webhook.create({ data: dto });
    await this.forgetHooks();
    return hook;
  }

  async findAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [total, data] = await Promise.all([
      this.prisma.webhook.count(),
      this.prisma.webhook.findMany({ orderBy: { createdAt: 'desc' }, skip, take: limit }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const hook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!hook) throw new NotFoundException(`Webhook #${id} not found`);
    return hook;
  }

  async update(id: number, dto: UpdateWebhookDto) {
    await this.findOne(id);
    const hook = await this.prisma.webhook.update({ where: { id }, data: dto });
    await this.forgetHooks();
    return hook;
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.webhook.delete({ where: { id } });
    await this.forgetHooks();
    return { message: `Webhook #${id} deleted` };
  }

  async toggle(id: number, enabled: boolean) {
    await this.findOne(id);
    const hook = await this.prisma.webhook.update({ where: { id }, data: { enabled } });
    await this.forgetHooks();
    return hook;
  }

  async ping(id: number) {
    const hook = await this.findOne(id);
    const body = JSON.stringify({
      event: 'ping',
      timestamp: new Date().toISOString(),
      data: { message: 'Test ping from NodePress', webhookId: id, webhookName: hook.name },
    });
    // Ping is a direct one-shot delivery — not stored in the queue
    await this.send(hook, 'ping', body, 1);
    return { message: 'Ping sent to ' + hook.url };
  }

  // ── Delivery log & Dead-Letter Queue (admin UI) ───────────────────────────────

  async findDeliveries(webhookId?: number, status?: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (webhookId) where.webhookId = webhookId;
    if (status && status !== 'all') where.status = status;

    const [total, rawData] = await Promise.all([
      (this.prisma as any).webhookDelivery.count({ where }),
      (this.prisma as any).webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Attach webhook details (name, url) for richer UI rendering
    const webhookIds = [...new Set(rawData.map((d: any) => d.webhookId))] as number[];
    const webhooks = await this.prisma.webhook.findMany({
      where: { id: { in: webhookIds } },
      select: { id: true, name: true, url: true, enabled: true },
    });
    const webhookMap = new Map(webhooks.map((h) => [h.id, h]));

    const data = rawData.map((d: any) => ({
      ...d,
      webhook: webhookMap.get(d.webhookId) || null,
    }));

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── 1-Click UI Re-Delivery ──────────────────────────────────────────────────

  async redeliver(deliveryId: number) {
    const delivery = await (this.prisma as any).webhookDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) {
      throw new NotFoundException(`Webhook delivery #${deliveryId} not found`);
    }

    const hook = await this.prisma.webhook.findUnique({
      where: { id: delivery.webhookId },
    });
    if (!hook) {
      throw new NotFoundException(`Associated webhook #${delivery.webhookId} was deleted`);
    }

    const body = JSON.stringify({
      event: delivery.event,
      timestamp: new Date().toISOString(),
      data: delivery.payload,
    });

    const attempt = delivery.attempts + 1;
    const res = await this.send(hook, delivery.event, body, attempt, { 'X-NodePress-Redelivery': 'true' });

    await (this.prisma as any).webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: res.ok ? 'delivered' : 'failed',
        attempts: attempt,
        responseStatus: res.status,
        errorMessage: res.ok ? null : res.error,
        nextRetryAt: null,
      },
    });

    if (res.ok) {
      return { success: true, status: res.status, message: `Re-delivered successfully (HTTP ${res.status})` };
    }
    return {
      success: false,
      status: res.status ?? 0,
      message: res.status ? `Re-delivery failed (HTTP ${res.status})` : `Re-delivery failed: ${res.error}`,
    };
  }

  // ── Fire (public API — non-blocking) ─────────────────────────────────────────

  /** Queue event for all matching enabled webhooks — non-blocking, never throws. */
  fire(event: WebhookEvent, payload: Record<string, any>): void {
    this.enqueue(event, payload).catch((err) =>
      this.logger.error(`Webhook enqueue error: ${err.message}`),
    );
  }

  /** Called after deliveries are queued, so a local worker can start at once instead of on its next poll. */
  onEnqueue(listener: () => void) {
    this.enqueueListener = listener;
  }

  /** Insert one pending delivery per matching webhook. The worker sends them. */
  async enqueue(event: string, payload: Record<string, any>): Promise<number> {
    const matching = (await this.enabledHooks()).filter((h) => {
      const events = h.events as string[];
      return events.includes('*') || events.includes(event);
    });
    if (matching.length === 0) return 0;

    const { count } = await (this.prisma as any).webhookDelivery.createMany({
      data: matching.map((hook) => ({
        webhookId: hook.id,
        event,
        payload: payload as any,
        status: 'pending',
        attempts: 0,
        nextRetryAt: new Date(), // due now
      })),
    });
    this.enqueueListener?.();
    return count;
  }

  // ── Queue worker API (see WebhookWorker) ─────────────────────────────────────

  /**
   * Atomically claim up to `limit` due deliveries. FOR UPDATE SKIP LOCKED lets
   * every instance claim concurrently without ever taking the same row.
   *
   * A claimed row stays `pending` with its attempt counted and `nextRetryAt`
   * pushed out by DELIVERY_LEASE_MS — the lease. If the worker dies mid-send,
   * the lease runs out and another worker picks the row up again.
   */
  async claimDue(limit: number): Promise<any[]> {
    if (limit <= 0) return [];
    return this.prisma.$queryRaw<any[]>`
      UPDATE "webhook_deliveries" d
      SET "attempts" = d."attempts" + 1,
          "nextRetryAt" = (now() AT TIME ZONE 'UTC') + make_interval(secs => ${DELIVERY_LEASE_MS / 1000}),
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE d."id" IN (
        SELECT "id" FROM "webhook_deliveries"
        WHERE "status" = 'pending' AND "attempts" < ${MAX_ATTEMPTS}
          AND "nextRetryAt" <= (now() AT TIME ZONE 'UTC')
        ORDER BY "nextRetryAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING d.*`;
  }

  /** Fail deliveries whose worker died during their last allowed attempt. */
  async failAbandoned(): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE "webhook_deliveries"
      SET "status" = 'failed', "nextRetryAt" = NULL,
          "errorMessage" = COALESCE("errorMessage", 'Delivery interrupted'),
          "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE "status" = 'pending' AND "attempts" >= ${MAX_ATTEMPTS}
        AND "nextRetryAt" <= (now() AT TIME ZONE 'UTC')`;
  }

  /** Send one claimed delivery and record the outcome. Never throws. */
  async deliver(delivery: any): Promise<void> {
    const attempt: number = delivery.attempts; // already counted by claimDue()
    try {
      const hook = (await this.enabledHooks()).find((h) => h.id === delivery.webhookId);
      if (!hook) {
        await (this.prisma as any).webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'failed', nextRetryAt: null, errorMessage: 'Webhook disabled or deleted' },
        });
        return;
      }

      const body = JSON.stringify({
        event: delivery.event,
        timestamp: new Date(delivery.createdAt ?? Date.now()).toISOString(),
        data: delivery.payload,
      });
      const res = await this.send(hook, delivery.event, body, attempt);

      if (res.ok) {
        this.logger.debug(`Webhook #${hook.id} delivered [${delivery.event}] (attempt ${attempt})`);
        await (this.prisma as any).webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'delivered', attempts: attempt, responseStatus: res.status, errorMessage: null, nextRetryAt: null },
        });
      } else {
        this.logger.warn(`Webhook #${hook.id} → ${res.error} (attempt ${attempt})`);
        await this.scheduleRetry(delivery.id, attempt, res.error ?? 'Delivery failed', res.status);
      }
    } catch (err: any) {
      // DB error recording the outcome: the lease expires and the row is retried.
      this.logger.error(`Webhook delivery #${delivery.id} error: ${err?.message}`);
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  /** Enabled webhooks, cached briefly so a burst of writes doesn't query them per event. */
  private async enabledHooks(): Promise<any[]> {
    const cached = await this.cache.get<any[]>(ENABLED_HOOKS_KEY);
    if (cached) return cached;
    const hooks = await this.prisma.webhook.findMany({ where: { enabled: true } });
    await this.cache.set(ENABLED_HOOKS_KEY, hooks, ENABLED_HOOKS_TTL);
    return hooks;
  }

  private async forgetHooks() {
    await this.cache.del(ENABLED_HOOKS_KEY);
  }

  /** POST a signed payload. Never throws; `status` is null when no response arrived. */
  private async send(
    hook: { url: string; secret?: string | null },
    event: string,
    body: string,
    attempt: number,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ ok: boolean; status: number | null; error?: string }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-NodePress-Event': event,
      'X-NodePress-Delivery': randomBytes(8).toString('hex'),
      'X-NodePress-Attempt': String(attempt),
      ...extraHeaders,
    };
    if (hook.secret) {
      const sig = createHmac('sha256', hook.secret).update(body).digest('hex');
      headers['X-NodePress-Signature'] = `sha256=${sig}`;
    }

    try {
      const res = await outboundPost(hook.url, { method: 'POST', headers, body, timeoutMs: 10_000, allowPrivate: env.WEBHOOK_ALLOW_PRIVATE === 'true' });
      return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, status: null, error: err?.message ?? 'Request failed' };
    }
  }

  private async scheduleRetry(
    deliveryId: number,
    attempt: number,
    errorMessage: string,
    responseStatus: number | null,
  ): Promise<void> {
    if (attempt >= MAX_ATTEMPTS) {
      // Exhausted — mark as permanently failed
      await (this.prisma as any).webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'failed', attempts: attempt, nextRetryAt: null, errorMessage, responseStatus },
      });
      this.logger.warn(`Webhook delivery #${deliveryId} failed after ${MAX_ATTEMPTS} attempts`);
      return;
    }

    const delayMs = RETRY_DELAYS_MS[attempt] ?? 30 * 60_000;
    await (this.prisma as any).webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'pending',
        attempts: attempt,
        nextRetryAt: new Date(Date.now() + delayMs),
        errorMessage,
        responseStatus,
      },
    });
  }
}
