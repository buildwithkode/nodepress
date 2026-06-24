import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormsService } from './forms.service';
import { ActionsService } from './actions/actions.service';
import { CaptchaService } from './captcha.service';
import { FormField, ActionDef } from './types/form-field.types';
import { validateSubmission, FormLimits } from './submission-validator';
import { env } from '../config/env';

const FORM_LIMITS: FormLimits = {
  maxDepth:        env.FORM_MAX_DEPTH,
  maxArrayItems:   env.FORM_MAX_ARRAY_ITEMS,
  maxFields:       env.FORM_MAX_FIELDS,
  maxPayloadBytes: env.FORM_MAX_PAYLOAD_BYTES,
};

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name);

  constructor(
    private prisma:    PrismaService,
    private forms:     FormsService,
    private actions:   ActionsService,
    private captcha:   CaptchaService,
  ) {}

  async submit(
    slug: string,
    rawData: Record<string, unknown>,
    captchaToken?: string,
    ip?: string,
  ) {
    // 1. Load the form (throws 404/400 if not found or inactive)
    const form = await this.forms.findBySlug(slug);
    const fields  = form.fields  as unknown as FormField[];
    const actions = form.actions as unknown as ActionDef[];

    // 2. Honeypot check — silent success, no DB write, no actions fired.
    //    Bots that auto-fill every field will hit this trap.
    //    Legitimate users never see or fill it (hidden via CSS on the frontend).
    if (rawData['_honey'] !== undefined && rawData['_honey'] !== '' && rawData['_honey'] !== null) {
      this.logger.debug(`Honeypot triggered for form "${slug}" from IP ${ip ?? 'unknown'}`);
      return { success: true, submissionId: null, message: 'Your submission has been received.' };
    }

    // 3. Captcha verification — enforced when captchaEnabled=true on the form.
    //    Falls through silently when no provider is configured (fail-open in dev).
    if (form.captchaEnabled) {
      const passed = await this.captcha.verify(captchaToken, ip);
      if (!passed) {
        throw new BadRequestException(
          this.captcha.isConfigured
            ? 'Captcha verification failed. Please try again.'
            : 'Captcha token is required but no captcha provider is configured on the server.',
        );
      }
    }

    // 4. Validate + coerce submission data against the form schema
    //    (recursive engine: typed scalars, arrays, nested groups/repeaters,
    //     declarative rules, and public-endpoint guardrails)
    const data = validateSubmission(fields, rawData, FORM_LIMITS);

    // 5. Persist submission
    const submission = await this.prisma.formSubmission.create({
      data: { formId: form.id, data: data as any, ip: ip ?? null },
    });

    // 6. Trigger actions asynchronously (non-blocking for the response)
    this.actions.run(actions, data, fields).catch(() => {
      // already logged inside ActionsService
    });

    return {
      success: true,
      submissionId: submission.id,
      message: 'Your submission has been received.',
    };
  }
}
