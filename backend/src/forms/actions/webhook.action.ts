import { Injectable, Logger } from '@nestjs/common';
import { WebhookAction } from '../types/form-field.types';

@Injectable()
export class WebhookActionHandler {
  private readonly logger = new Logger(WebhookActionHandler.name);

  async handle(action: WebhookAction, data: Record<string, unknown>): Promise<void> {
    const method  = action.method ?? 'POST';
    const headers = { 'Content-Type': 'application/json', ...(action.headers ?? {}) };

    try {
      const res = await fetch(action.url, {
        method,
        headers,
        body: JSON.stringify({ data }),
      });

      if (!res.ok) {
        this.logger.warn(`Webhook ${action.url} returned ${res.status}`);
      } else {
        this.logger.log(`Webhook delivered to ${action.url} — ${res.status}`);
      }
    } catch (err) {
      this.logger.error(`Webhook action failed: ${err.message}`);
      // Don't throw — a failed webhook must not break the submission response
    }
  }
}
