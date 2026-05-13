import { Controller, Post, Param, Body, Headers, Req, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SubmissionService } from './submission.service';

@ApiTags('Forms')
@Controller('submit')
export class SubmitController {
  constructor(private readonly submission: SubmissionService) {}

  /**
   * Public endpoint — no authentication required.
   * POST /api/submit/:slug  { "field_name": "value", ... }
   *
   * Spam protection:
   *   - Rate-limited to 20 submissions per minute per IP.
   *   - Honeypot: include a hidden _honey field; any non-empty value is silently dropped.
   *   - Captcha: when captchaEnabled=true on the form and CAPTCHA_PROVIDER is set,
   *     pass the widget token via the X-Captcha-Token request header.
   */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post(':slug')
  @ApiOperation({
    summary: 'Submit a form (public)',
    description:
      'No auth required. Send form fields as a flat JSON object. ' +
      'Rate-limited to 20/min per IP. ' +
      'Honeypot: include a hidden `_honey` field — non-empty value silently drops the submission. ' +
      'Captcha: pass the widget token in the `X-Captcha-Token` header when the form has captchaEnabled=true.',
  })
  @ApiParam({ name: 'slug', description: 'Form slug as configured in the admin panel' })
  @ApiHeader({
    name: 'X-Captcha-Token',
    required: false,
    description: 'Captcha widget token (Turnstile / hCaptcha / reCAPTCHA). Required when the form has captchaEnabled=true.',
  })
  submit(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-captcha-token') captchaToken: string | undefined,
    @Req() req: Request,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a flat JSON object of form fields');
    }
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress;
    return this.submission.submit(slug, body, captchaToken, ip);
  }
}
