import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormsService } from './forms.service';
import { ActionsService } from './actions/actions.service';
import { CaptchaService } from './captcha.service';
import { FormField, ActionDef } from './types/form-field.types';

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

    // 4. Validate submission data against the form schema
    const data = this.validate(fields, rawData);

    // 5. Persist submission
    const submission = await this.prisma.formSubmission.create({
      data: { formId: form.id, data: data as any, ip: ip ?? null },
    });

    // 6. Trigger actions asynchronously (non-blocking for the response)
    this.actions.run(actions, data).catch(() => {
      // already logged inside ActionsService
    });

    const response: Record<string, unknown> = {
      success:      true,
      submissionId: submission.id,
      message:      form.successMessage ?? 'Your submission has been received.',
    };
    if (form.redirectUrl) response.redirectUrl = form.redirectUrl;
    return response;
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private validate(
    fields: FormField[],
    raw: Record<string, unknown>,
  ): Record<string, unknown> {
    const errors: string[] = [];
    const clean: Record<string, unknown> = {};

    for (const field of fields) {
      const value = raw[field.name];
      const isEmpty = value === undefined || value === null || String(value).trim() === '';

      if (field.required && isEmpty) {
        errors.push(`"${field.label ?? field.name}" is required`);
        continue;
      }

      if (isEmpty) {
        clean[field.name] = null;
        continue;
      }

      clean[field.name] = this.coerce(field, value);
    }

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }

    return clean;
  }

  private coerce(field: FormField, value: unknown): unknown {
    const str = String(value).trim();

    switch (field.type) {
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
          throw new BadRequestException(`"${field.label ?? field.name}" must be a valid email address`);
        }
        return str.toLowerCase();

      case 'number': {
        const n = Number(value);
        if (isNaN(n)) {
          throw new BadRequestException(`"${field.label ?? field.name}" must be a number`);
        }
        return n;
      }

      case 'checkbox':
        return value === true || value === 'true' || value === 1 || value === '1';

      case 'select':
      case 'radio':
        if (field.options && !field.options.includes(str)) {
          throw new BadRequestException(
            `"${field.label ?? field.name}" must be one of: ${field.options.join(', ')}`,
          );
        }
        return str;

      default:
        return str;
    }
  }
}
