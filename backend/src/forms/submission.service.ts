import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormsService } from './forms.service';
import { ActionsService } from './actions/actions.service';
import { FormField, ActionDef } from './types/form-field.types';

@Injectable()
export class SubmissionService {
  constructor(
    private prisma:    PrismaService,
    private forms:     FormsService,
    private actions:   ActionsService,
  ) {}

  async submit(slug: string, rawData: Record<string, unknown>, ip?: string) {
    // 1. Load the form (throws 404/400 if not found or inactive)
    const form = await this.forms.findBySlug(slug);
    const fields  = form.fields  as unknown as FormField[];
    const actions = form.actions as unknown as ActionDef[];

    // 2. Validate submission data against the form schema
    const data = this.validate(fields, rawData);

    // 3. Persist submission
    const submission = await this.prisma.formSubmission.create({
      data: { formId: form.id, data: data as any, ip: ip ?? null },
    });

    // 4. Trigger actions asynchronously (non-blocking for the response)
    this.actions.run(actions, data).catch(() => {
      // already logged inside ActionsService
    });

    return {
      success: true,
      submissionId: submission.id,
      message: 'Your submission has been received.',
    };
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
        // Accepts boolean, "true"/"false", 1/0
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
