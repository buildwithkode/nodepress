import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { outboundPost } from '../../common/outbound-post';
import { WebhookAction } from '../types/form-field.types';

/** Per-request timeout, well inside the job lease. */
const TIMEOUT_MS = 10_000;

@Injectable()
export class WebhookActionHandler {
  private readonly logger = new Logger(WebhookActionHandler.name);

  /** Runs as a queued job (see ActionsService): throws on failure so the job is retried. */
  async handle(action: WebhookAction, data: Record<string, unknown>): Promise<void> {
    const method  = action.method ?? 'POST';
    const headers = { 'Content-Type': 'application/json', ...(action.headers ?? {}) };

    const res = await outboundPost(action.url, {
      method,
      headers,
      body: JSON.stringify({ data }),
      timeoutMs: TIMEOUT_MS,
      allowPrivate: env.WEBHOOK_ALLOW_PRIVATE === 'true',
    });

    if (!res.ok) throw new Error(`Form webhook ${action.url} returned HTTP ${res.status}`);
    this.logger.log(`Webhook delivered to ${action.url} — ${res.status}`);
  }
}
