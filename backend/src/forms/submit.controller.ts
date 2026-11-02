import { Controller, Post, Param, Body, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SubmissionService } from './submission.service';
import { SubmitFormDto } from './dto/submit-form.dto';
import { MAX_FILES_PER_SUBMISSION } from './form-files';
import { maxUploadBytes } from '../media/upload-limits';

@ApiTags('Forms')
@Controller('submit')
export class SubmitController {
  constructor(private readonly submission: SubmissionService) {}

  /**
   * Public endpoint — no authentication required.
   * POST /api/submit/:slug  { "data": { ... }, "captchaToken": "..." }
   *
   * Spam protection:
   *   - Rate-limited to 20 submissions per minute per IP.
   *   - Honeypot: include a hidden _honey field in your form HTML;
   *     any submission where _honey is non-empty is silently dropped.
   *   - Captcha: when captchaEnabled=true on the form and CAPTCHA_PROVIDER
   *     is set in the backend env, the captchaToken field is verified
   *     server-side (Turnstile / hCaptcha / reCAPTCHA).
   *
   * Files: post multipart/form-data with `data` as a JSON string and each file
   * under its `file` field's name. Files stay private; see FormFile.
   */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseInterceptors(AnyFilesInterceptor({
    limits: { fileSize: maxUploadBytes(), files: MAX_FILES_PER_SUBMISSION },
  }))
  @Post(':slug')
  @ApiOperation({
    summary: 'Submit a form (public)',
    description:
      'No auth required. Validates against form schema, stores submission, and fires configured actions. ' +
      'Rate-limited to 20/min per IP. Supports honeypot (_honey field) and captcha (captchaToken field).',
  })
  @ApiParam({ name: 'slug', description: 'Form slug as configured in the admin panel' })
  submit(
    @Param('slug') slug: string,
    @Body() dto: SubmitFormDto,
    @Req() req: Request,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress;
    return this.submission.submit(slug, dto.data, dto.captchaToken, ip, files);
  }
}
