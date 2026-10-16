import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobsService } from '../../jobs/jobs.service';
import { ActionDef, EmailAction, FormField, WebhookAction } from '../types/form-field.types';
import { EmailActionHandler } from './email.action';
import { WebhookActionHandler } from './webhook.action';

export const FORM_EMAIL_JOB = 'form.email';
export const FORM_WEBHOOK_JOB = 'form.webhook';

/** What a queued form action carries — a snapshot, so later form edits don't change it. */
interface FormActionJob<A> {
  formId: number;
  submissionId: number;
  action: A;
  data: Record<string, unknown>;
  fields?: { name: string; label?: string }[];
}

/**
 * Form actions run as background jobs: a submission only queues them, and the
 * job worker sends them with retries (3 attempts), so a slow or failing SMTP
 * server or endpoint never affects the submitter and a restart loses nothing.
 */
@Injectable()
export class ActionsService implements OnModuleInit {
  constructor(
    private jobs:          JobsService,
    private emailAction:   EmailActionHandler,
    private webhookAction: WebhookActionHandler,
  ) {}

  onModuleInit() {
    this.jobs.registerHandler(FORM_EMAIL_JOB, (p: FormActionJob<EmailAction>) =>
      this.emailAction.handle(p.action, p.data, p.fields),
    );
    this.jobs.registerHandler(FORM_WEBHOOK_JOB, (p: FormActionJob<WebhookAction>) =>
      this.webhookAction.handle(p.action, p.data),
    );
  }

  /** Queue one job per configured action. Returns how many were queued. */
  async queue(
    actions: ActionDef[],
    data: Record<string, unknown>,
    context: { formId: number; submissionId: number },
    fields?: FormField[],
  ): Promise<number> {
    const labels = fields?.map((f) => ({ name: f.name, label: f.label }));
    const jobs = (actions ?? []).flatMap((action) => {
      const payload = { ...context, action, data, fields: labels };
      if (action.type === 'email') return [{ type: FORM_EMAIL_JOB, payload }];
      if (action.type === 'webhook') return [{ type: FORM_WEBHOOK_JOB, payload }];
      return [];
    });
    return this.jobs.enqueueMany(jobs);
  }
}
