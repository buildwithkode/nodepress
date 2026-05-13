import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';
import { EmailAction, EmailReplyAction } from '../types/form-field.types';

@Injectable()
export class EmailActionHandler {
  async handle(action: EmailAction, mail: MailService, data: Record<string, unknown>): Promise<void> {
    const subject = MailService.interpolate(action.subject, data);
    const replyTo = action.replyToField ? String(data[action.replyToField] ?? '') : undefined;
    await mail.sendFormSubmission(action.to, subject, data, replyTo);
  }
}

@Injectable()
export class EmailReplyActionHandler {
  private readonly logger = new Logger(EmailReplyActionHandler.name);

  async handle(action: EmailReplyAction, mail: MailService, data: Record<string, unknown>): Promise<void> {
    const to = data[action.toField];
    if (!to || typeof to !== 'string' || !to.includes('@')) {
      this.logger.warn(`email-reply: field "${action.toField}" is missing or not a valid email — skipping`);
      return;
    }
    const subject = MailService.interpolate(action.subject, data);
    const body    = action.body ? MailService.interpolate(action.body, data) : undefined;
    await mail.sendAutoReply(to, subject, data, body);
  }
}
