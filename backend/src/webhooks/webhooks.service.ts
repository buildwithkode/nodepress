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

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWebhookDto) {
    return (this.prisma as any).webhook.create({ data: dto });
  }

  async findAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [total, data] = await Promise.all([
      (this.prisma as any).webhook.count(),
      (this.prisma as any).webhook.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const hook = await (this.prisma as any).webhook.findUnique({ where: { id } });
    if (!hook) throw new NotFoundException(`Webhook #${id} not found`);
    return hook;
  }

  async remove(id: number) {
    await this.findOne(id);
    await (this.prisma as any).webhook.delete({ where: { id } });
    return { message: `Webhook #${id} deleted` };
  }

  async toggle(id: number, enabled: boolean) {
    await this.findOne(id);
    return (this.prisma as any).webhook.update({ where: { id }, data: { enabled } });
  }

  async ping(id: number) {
    const hook = await this.findOne(id);
    const body = JSON.stringify({
      event: 'ping',
      timestamp: new Date().toISOString(),
      data: { message: 'Test ping from NodePress', webhookId: id, webhookName: hook.name },
    });
    await this.deliver(hook, body, 'ping');
    return { message: 'Ping sent to ' + hook.url };
  }

  /** Fire event to all matching enabled webhooks — non-blocking, never throws. */
  fire(event: WebhookEvent, payload: Record<string, any>): void {
    this.deliverAll(event, payload).catch((err) =>
      this.logger.error(`Webhook batch delivery error: ${err.message}`),
    );
  }

  // ── private ────────────────────────────────────────────────────────────────

  private async deliverAll(event: string, payload: Record<string, any>) {
    const hooks: any[] = await (this.prisma as any).webhook.findMany({ where: { enabled: true } });
    const matching = hooks.filter((h) => {
      const events = h.events as string[];
      return events.includes('*') || events.includes(event);
    });

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
    await Promise.allSettled(matching.map((h) => this.deliver(h, body, event)));
  }

  private async deliver(hook: any, body: string, event: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-NodePress-Event': event,
      'X-NodePress-Delivery': randomBytes(8).toString('hex'),
    };
    if (hook.secret) {
      const sig = createHmac('sha256', hook.secret).update(body).digest('hex');
      headers['X-NodePress-Signature'] = `sha256=${sig}`;
    }

    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`Webhook #${hook.id} "${hook.name}" → HTTP ${res.status} for [${event}]`);
      } else {
        this.logger.debug(`Webhook #${hook.id} "${hook.name}" delivered [${event}]`);
      }
    } catch (err: any) {
      this.logger.warn(`Webhook #${hook.id} "${hook.name}" error: ${err.message}`);
    }
  }
}
