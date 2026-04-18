import { Injectable } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';
import { EmailAction } from '../types/form-field.types';

/**
 * EmailActionHandler — fires an email when a form is submitted.
 *
 * Delegates to MailService (singleton transporter, validated env config).
 * Subject supports {{field_name}} interpolation against submission data.
 */
@Injectable()
export class EmailActionHandler {
  constructor(private readonly mail: MailService) {}

  async handle(action: EmailAction, data: Record<string, unknown>): Promise<void> {
    const subject = MailService.interpolate(action.subject, data);
    const replyTo = action.replyToField
      ? String(data[action.replyToField] ?? '')
      : undefined;

    await this.mail.sendFormSubmission(action.to, subject, data, replyTo);
  }
}
