import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailAction } from '../types/form-field.types';

@Injectable()
export class EmailActionHandler {
  private readonly logger = new Logger(EmailActionHandler.name);

  private transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.ethereal.email',
    port:   Number(process.env.SMTP_PORT)   || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });

  async handle(action: EmailAction, data: Record<string, unknown>): Promise<void> {
    const subject  = this.interpolate(action.subject, data);
    const replyTo  = action.replyToField
      ? String(data[action.replyToField] ?? '')
      : undefined;

    // Build a simple HTML body from all submitted fields
    const rows = Object.entries(data)
      .map(([k, v]) => `<tr><td style="padding:4px 8px;font-weight:bold">${k}</td><td style="padding:4px 8px">${v}</td></tr>`)
      .join('');
    const html = `<table border="0" cellpadding="0" cellspacing="0">${rows}</table>`;

    try {
      await this.transporter.sendMail({
        from:    process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@nodepress.local',
        to:      action.to,
        subject,
        replyTo,
        html,
      });
      this.logger.log(`Email sent to ${action.to} — subject: "${subject}"`);
    } catch (err) {
      this.logger.error(`Email action failed: ${err.message}`);
      // Don't throw — a failed email must not break the submission response
    }
  }

  /** Replace {{field_name}} tokens with actual submission values */
  private interpolate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      data[key] !== undefined ? String(data[key]) : `{{${key}}}`,
    );
  }
}
