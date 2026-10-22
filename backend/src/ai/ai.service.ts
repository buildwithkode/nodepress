import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SchemaValidator } from '../fields/schema.validator';
import { DataValidator } from '../fields/data.validator';
import { ALL_FIELD_TYPES, FieldDef, SIMPLE_FIELD_TYPES, isReverseRelation } from '../fields/field.types';

const MAX_PROMPT = 4000;

// ── Content model ────────────────────────────────────────────────────────────

const SimpleField = z.object({
  name: z.string().describe('snake_case identifier'),
  label: z.string(),
  type: z.enum(SIMPLE_FIELD_TYPES.filter((t) => t !== 'relation') as [string, ...string[]]),
  required: z.boolean(),
  description: z.string().describe('Helper text for editors, or empty'),
  choices: z.array(z.string()).describe('Only for select fields; otherwise empty'),
  multiple: z.boolean().describe('Only for select fields'),
});

const Field = z.object({
  name: z.string().describe('snake_case identifier, unique in the content type'),
  label: z.string(),
  type: z.enum(ALL_FIELD_TYPES as unknown as [string, ...string[]]),
  required: z.boolean(),
  description: z.string().describe('Helper text for editors, or empty'),
  choices: z.array(z.string()).describe('Only for select fields; otherwise empty'),
  multiple: z.boolean().describe('Only for select fields'),
  related_content_type: z.string().describe('Only for relation fields: an existing content type name; otherwise empty'),
  cardinality: z.enum(['one', 'many']).describe('Only for relation fields'),
  sub_fields: z.array(SimpleField).describe('Only for repeater and group fields; otherwise empty'),
  layouts: z
    .array(z.object({ name: z.string(), label: z.string(), fields: z.array(SimpleField) }))
    .describe('Only for flexible fields: the block types; otherwise empty'),
});

const ContentModel = z.object({
  name: z.string().describe('snake_case, singular, e.g. "blog_post"'),
  display_name: z.string().describe('Human name, e.g. "Blog post"'),
  fields: z.array(Field),
});

type SimpleFieldOut = z.infer<typeof SimpleField>;

const toSimple = (f: SimpleFieldOut) => ({
  name: f.name,
  label: f.label,
  type: f.type,
  ...(f.required ? { required: true } : {}),
  ...(f.description ? { description: f.description } : {}),
  ...(f.type === 'select' ? { options: { choices: f.choices, ...(f.multiple ? { multiple: true } : {}) } } : {}),
});

/**
 * Optional AI help in the admin, backed by the Claude API (ANTHROPIC_API_KEY):
 * turn a description into a content type, and draft an entry's fields.
 * Results are suggestions — they're validated, returned to the editor, and
 * saved only when a person saves them.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client?: Anthropic;

  constructor(
    private readonly prisma: PrismaService,
    private readonly schemaValidator: SchemaValidator,
    private readonly dataValidator: DataValidator,
  ) {}

  get enabled(): boolean {
    return !!env.ANTHROPIC_API_KEY;
  }

  status() {
    return { enabled: this.enabled, model: this.enabled ? env.AI_MODEL : null };
  }

  async generateContentModel(prompt: string) {
    const existing = await this.prisma.contentType.findMany({ select: { name: true } });
    const parsed = await this.ask(
      ContentModel,
      'You design content models for NodePress, a headless CMS. Return one content type for the request. ' +
        'Use the fewest fields that cover it, snake_case names, and the most specific field type: ' +
        'text (short), textarea (plain paragraphs), richtext (formatted body), number, boolean, select (fixed choices), ' +
        'image, date, datetime, color, json, relation (link to another content type), ' +
        'repeater (a list of rows of simple fields), group (a fixed set of sub-fields), flexible (a list of blocks of different layouts). ' +
        'Only add relation fields to content types that already exist. Leave options that do not apply to a field empty.',
      `Existing content types: ${existing.map((c) => c.name).join(', ') || '(none)'}\n\nRequest:\n${this.clean(prompt)}`,
    );

    const names = new Set(existing.map((c) => c.name));
    const schema = parsed.fields.map((f) => {
      const base = toSimple(f as SimpleFieldOut);
      switch (f.type) {
        case 'relation':
          return names.has(f.related_content_type)
            ? { ...base, options: { relatedContentType: f.related_content_type, cardinality: f.cardinality } }
            : null; // drop links to types that don't exist
        case 'repeater':
        case 'group':
          return f.sub_fields.length ? { ...base, options: { subFields: f.sub_fields.map(toSimple) } } : null;
        case 'flexible':
          return f.layouts.length
            ? { ...base, options: { layouts: f.layouts.map((l) => ({ name: l.name, label: l.label, fields: l.fields.map(toSimple) })) } }
            : null;
        default:
          return base;
      }
    }).filter(Boolean);

    try {
      return {
        name: parsed.name,
        displayName: parsed.display_name,
        schema: this.schemaValidator.validate(schema),
      };
    } catch (err: any) {
      this.logger.warn(`AI content model failed validation: ${JSON.stringify(err?.response?.errors ?? err?.message)}`);
      throw new UnprocessableEntityException('The suggested content type was not valid — try rephrasing the request');
    }
  }

  async draftEntry(contentTypeId: number, prompt: string, current?: Record<string, unknown>) {
    const ct = await this.prisma.contentType.findUnique({ where: { id: contentTypeId } });
    if (!ct) throw new NotFoundException(`Content type #${contentTypeId} not found`);
    const fields = (ct.schema as unknown as FieldDef[]).filter((f) => DRAFTABLE.has(f.type) && !isReverseRelation(f));
    if (!fields.length) throw new BadRequestException('This content type has no text, number or choice fields to draft');

    const shape: Record<string, z.ZodType> = {};
    for (const f of fields) shape[f.name] = draftSchema(f);
    const data = await this.ask(
      z.object(shape),
      'You write content for a website managed in NodePress. Fill every field for the request in the editor\'s language. ' +
        'Richtext fields are HTML using only p, h2, h3, ul, ol, li, strong, em, a and blockquote. Dates are YYYY-MM-DD. ' +
        'Keep facts to what the request gives you; don\'t invent names, numbers or quotes.',
      [
        `Content type: ${ct.displayName || ct.name}`,
        `Fields:\n${fields.map((f) => `- ${f.name} (${f.type}${f.label ? `, "${f.label}"` : ''}${f.description ? `: ${f.description}` : ''})`).join('\n')}`,
        current && Object.keys(current).length ? `Current values (improve on them):\n${JSON.stringify(current).slice(0, 8000)}` : '',
        `Request:\n${this.clean(prompt)}`,
      ].filter(Boolean).join('\n\n'),
    );

    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== ''));
    this.dataValidator.validate(clean, fields, { partial: true });
    return { data: clean };
  }

  // ── Claude API ─────────────────────────────────────────────────────────────

  private async ask<T extends z.ZodType>(schema: T, system: string, user: string): Promise<z.infer<T>> {
    if (!this.enabled) throw new ServiceUnavailableException('AI is not configured — set ANTHROPIC_API_KEY on the server');
    this.client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: env.AI_MODEL,
        max_tokens: 16000,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { effort: 'low', format: zodOutputFormat(schema as any) }, // cast: ts-jest resolves zod/v4's typings twice
        // If the model declines, the API retries on a fallback model in the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new ServiceUnavailableException('The ANTHROPIC_API_KEY was rejected');
      if (err instanceof Anthropic.RateLimitError) throw new ServiceUnavailableException('The AI service is busy — try again in a minute');
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Claude API error ${err.status}: ${err.message}`);
        throw new BadGatewayException('The AI service returned an error');
      }
      throw err;
    }
    if (response.stop_reason === 'refusal') throw new UnprocessableEntityException('The AI declined this request');
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      throw new BadGatewayException('The AI response was incomplete — try a shorter request');
    }
    return response.parsed_output as z.infer<T>;
  }

  private clean(prompt: string) {
    const p = String(prompt ?? '').trim();
    if (!p) throw new BadRequestException('Describe what you want');
    if (p.length > MAX_PROMPT) throw new BadRequestException(`Keep the request under ${MAX_PROMPT} characters`);
    return p;
  }
}

const DRAFTABLE = new Set(['text', 'textarea', 'richtext', 'number', 'boolean', 'select', 'date', 'datetime', 'color']);

function draftSchema(f: FieldDef): z.ZodType {
  const describe = (s: z.ZodType) => s.describe(f.description || f.label || f.name);
  switch (f.type) {
    case 'number':
      return describe(z.number());
    case 'boolean':
      return describe(z.boolean());
    case 'select': {
      const choices = ((f as any).options?.choices ?? []) as string[];
      const one = choices.length ? z.enum(choices as [string, ...string[]]) : z.string();
      return describe((f as any).options?.multiple ? z.array(one) : one);
    }
    // Formats are described rather than enforced in the schema; DataValidator checks them after.
    case 'color':
      return z.string().describe(`${f.label || f.name} — hex colour like #1a2b3c`);
    case 'date':
      return z.string().describe(`${f.label || f.name} — YYYY-MM-DD`);
    case 'datetime':
      return z.string().describe(`${f.label || f.name} — ISO 8601 date-time`);
    default:
      return describe(z.string());
  }
}
