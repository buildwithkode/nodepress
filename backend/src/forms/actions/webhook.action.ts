import { Injectable, Logger } from '@nestjs/common';
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

    const res = await fetch(action.url, {
      method,
      headers,
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Form webhook ${action.url} returned HTTP ${res.status}`);
    this.logger.log(`Webhook delivered to ${action.url} — ${res.status}`);
  }
}
