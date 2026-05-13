import { Injectable } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';
import { ActionDef } from '../types/form-field.types';
import { EmailActionHandler, EmailReplyActionHandler } from './email.action';
import { WebhookActionHandler } from './webhook.action';

@Injectable()
export class ActionsService {
  constructor(
    private readonly mail:             MailService,
    private readonly emailAction:      EmailActionHandler,
    private readonly emailReplyAction: EmailReplyActionHandler,
    private readonly webhookAction:    WebhookActionHandler,
  ) {}

  /** Fire all configured actions. Errors per-action are swallowed (logged only). */
  async run(actions: ActionDef[], data: Record<string, unknown>): Promise<void> {
    await Promise.allSettled(
      actions.map((action) => {
        if (action.type === 'email')       return this.emailAction.handle(action, this.mail, data);
        if (action.type === 'email-reply') return this.emailReplyAction.handle(action, this.mail, data);
        if (action.type === 'webhook')     return this.webhookAction.handle(action, data);
        return Promise.resolve();
      }),
    );
  }
}
