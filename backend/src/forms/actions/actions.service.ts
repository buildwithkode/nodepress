import { Injectable } from '@nestjs/common';
import { ActionDef } from '../types/form-field.types';
import { EmailActionHandler } from './email.action';
import { WebhookActionHandler } from './webhook.action';

@Injectable()
export class ActionsService {
  constructor(
    private emailAction:   EmailActionHandler,
    private webhookAction: WebhookActionHandler,
  ) {}

  /** Fire all configured actions. Errors per-action are swallowed (logged only). */
  async run(actions: ActionDef[], data: Record<string, unknown>): Promise<void> {
    await Promise.allSettled(
      actions.map((action) => {
        if (action.type === 'email')   return this.emailAction.handle(action, data);
        if (action.type === 'webhook') return this.webhookAction.handle(action, data);
        return Promise.resolve();
      }),
    );
  }
}
