import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormsService } from './forms.service';
import { ActionsService } from './actions/actions.service';
import { CaptchaService } from './captcha.service';
import { FormField, ActionDef } from './types/form-field.types';
import { validateSubmission, FormLimits } from './submission-validator';
import { env } from '../config/env';
import { attachUploads } from './form-files';
import { maxUploadBytes } from '../media/upload-limits';

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
    uploaded: Express.Multer.File[] = [],
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
    const { values, files } = attachUploads(fields, rawData, uploaded, maxUploadBytes());
    const data = validateSubmission(fields, values, FORM_LIMITS);

    // A repeat of a `unique` field gets the normal reply and fires no actions, so nobody can use
    // this endpoint to find out whether an address is already in the list.
    if (await this.isRepeat(form.id, fields, data)) {
      return { success: true, submissionId: null, message: 'Your submission has been received.' };
    }

    // 5. Persist submission and its files together
    const submission = await this.prisma.formSubmission.create({
      data: {
        formId: form.id,
        data: data as any,
        ip: ip ?? null,
        ...(files.length ? { files: { create: files } } : {}),
      },
    });

    // 6. Queue actions (email/webhook) as background jobs. The submission is
    //    already saved, so a queueing error is logged, not returned.
    try {
      await this.actions.queue(actions, data, { formId: form.id, submissionId: submission.id }, fields);
    } catch (err: any) {
      this.logger.error(`Could not queue actions for submission #${submission.id}: ${err?.message}`);
    }

    return {
      success: true,
      submissionId: submission.id,
      message: 'Your submission has been received.',
    };
  }

  private async isRepeat(formId: number, fields: FormField[], data: Record<string, unknown>) {
    for (const field of fields) {
      const value = data[field.name];
      if (!field.unique || (typeof value !== 'string' && typeof value !== 'number') || value === '') continue;
      const found = await this.prisma.$queryRaw<unknown[]>`
        SELECT 1 FROM form_submissions
        WHERE "formId" = ${formId} AND lower(data->>${field.name}) = lower(${String(value)})
        LIMIT 1`;
      if (found.length > 0) return true;
    }
    return false;
  }

  /** One submission's file, for the admin. The form id must match, so a link can't reach another form's file. */
  async findFile(formId: number, submissionId: number, fileId: string) {
    const file = await this.prisma.formFile.findFirst({
      where: { id: fileId, submissionId, submission: { formId } },
    });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }
}
