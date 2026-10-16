import { Injectable } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';
import { EmailAction } from '../types/form-field.types';

/**
 * EmailActionHandler — sends the email for a form's email action.
 *
 * Runs as a queued job (see ActionsService), so a failed send throws and is
 * retried. Without SMTP configured the email is skipped, not retried.
 * Subject supports {{field_name}} interpolation against submission data.
 */
@Injectable()
export class EmailActionHandler {
  constructor(private readonly mail: MailService) {}

  async handle(
    action: EmailAction,
    data: Record<string, unknown>,
    fields?: { name: string; label?: string }[],
  ): Promise<void> {
    const subject = MailService.interpolate(action.subject, data);
    const replyTo = action.replyToField
      ? String(data[action.replyToField] ?? '')
      : undefined;

    await this.mail.sendFormSubmission(action.to, subject, data, replyTo, fields, { throwOnError: true });
  }
}
