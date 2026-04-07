import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';

export type WebhookEvent =
  | 'entry.created'
  | 'entry.updated'
  | 'entry.deleted'
  | 'entry.restored'
  | 'entry.purged'
  | 'media.uploaded'
  | 'media.deleted'
  | '*';

/** Delay before each retry attempt (ms): attempt 1 = immediate, 2 = 5 min, 3 = 30 min */
const RETRY_DELAYS_MS = [0, 5 * 60_000, 30 * 60_000];
const MAX_ATTEMPTS = 3;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async create(dto: CreateWebhookDto) {
    return this.prisma.webhook.create({ data: dto });
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

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.webhook.delete({ where: { id } });
    return { message: `Webhook #${id} deleted` };
  }

  async toggle(id: number, enabled: boolean) {
    await this.findOne(id);
    return this.prisma.webhook.update({ where: { id }, data: { enabled } });
  }

  async ping(id: number) {
    const hook = await this.findOne(id);
    const body = JSON.stringify({
      event: 'ping',
      timestamp: new Date().toISOString(),
      data: { message: 'Test ping from NodePress', webhookId: id, webhookName: hook.name },
    });
    // Ping is a direct one-shot delivery — not stored in the retry queue
    await this.attemptDelivery({ id: -1, webhookId: id, event: 'ping', payload: {}, attempts: 0, _hook: hook, _body: body });
    return { message: 'Ping sent to ' + hook.url };
  }

  // ── Delivery log (admin UI) ───────────────────────────────────────────────────

  async findDeliveries(webhookId?: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (webhookId) where.webhookId = webhookId;

    const [total, data] = await Promise.all([
      (this.prisma as any).webhookDelivery.count({ where }),
      (this.prisma as any).webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Fire (public API — non-blocking) ─────────────────────────────────────────

  /** Enqueue event to all matching enabled webhooks — non-blocking, never throws. */
  fire(event: WebhookEvent, payload: Record<string, any>): void {
    this.enqueueAll(event, payload).catch((err) =>
      this.logger.error(`Webhook enqueue error: ${err.message}`),
    );
  }

  // ── Retry (called by scheduler) ───────────────────────────────────────────────

  async retryDeliveries(deliveries: any[]): Promise<void> {
    await Promise.allSettled(deliveries.map((d) => this.attemptDelivery(d)));
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private async enqueueAll(event: string, payload: Record<string, any>): Promise<void> {
    const hooks: any[] = await this.prisma.webhook.findMany({ where: { enabled: true } });
    const matching = hooks.filter((h) => {
      const events = h.events as string[];
      return events.includes('*') || events.includes(event);
    });

    if (matching.length === 0) return;

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });

    // Create a delivery record for each matching webhook (status=pending, attempt immediately)
    await Promise.allSettled(
      matching.map(async (hook) => {
        const delivery = await (this.prisma as any).webhookDelivery.create({
          data: {
            webhookId: hook.id,
            event,
            payload: payload as any,
            status: 'pending',
            attempts: 0,
            nextRetryAt: new Date(), // attempt immediately
          },
        });
        await this.attemptDelivery({ ...delivery, _hook: hook, _body: body });
      }),
    );
  }

  private async attemptDelivery(delivery: any): Promise<void> {
    // Load the webhook if not preloaded
    const hook = delivery._hook ?? await this.prisma.webhook.findUnique({ where: { id: delivery.webhookId } });
    if (!hook || !hook.enabled) {
      await (this.prisma as any).webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'failed', errorMessage: 'Webhook disabled or deleted' },
      });
      return;
    }

    const body = delivery._body ?? JSON.stringify({
      event: delivery.event,
      timestamp: new Date().toISOString(),
      data: delivery.payload,
    });

    const attempt = delivery.attempts + 1;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-NodePress-Event': delivery.event,
        'X-NodePress-Delivery': randomBytes(8).toString('hex'),
        'X-NodePress-Attempt': String(attempt),
      };
      if (hook.secret) {
        const sig = createHmac('sha256', hook.secret).update(body).digest('hex');
        headers['X-NodePress-Signature'] = `sha256=${sig}`;
      }

      const res = await fetch(hook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        this.logger.debug(`Webhook #${hook.id} delivered [${delivery.event}] (attempt ${attempt})`);
        await (this.prisma as any).webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'delivered', attempts: attempt, responseStatus: res.status, nextRetryAt: null },
        });
      } else {
        this.logger.warn(`Webhook #${hook.id} → HTTP ${res.status} (attempt ${attempt})`);
        await this.scheduleRetry(delivery.id, attempt, `HTTP ${res.status}`, res.status);
      }
    } catch (err: any) {
      this.logger.warn(`Webhook #${hook.id} error: ${err.message} (attempt ${attempt})`);
      await this.scheduleRetry(delivery.id, attempt, err.message, null);
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
        data: {
          status: 'failed',
          attempts: attempt,
          nextRetryAt: null,
          errorMessage,
          responseStatus,
        },
      });
      this.logger.warn(`Webhook delivery #${deliveryId} failed after ${MAX_ATTEMPTS} attempts`);
      return;
    }

    const delayMs = RETRY_DELAYS_MS[attempt] ?? 30 * 60_000;
    const nextRetryAt = new Date(Date.now() + delayMs);

    await (this.prisma as any).webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'pending',
        attempts: attempt,
        nextRetryAt,
        errorMessage,
        responseStatus,
      },
    });
  }
}
