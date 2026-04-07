import { Controller, Post, Param, Body, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SubmissionService } from './submission.service';
import { SubmitFormDto } from './dto/submit-form.dto';

@ApiTags('Forms')
@Controller('submit')
export class SubmitController {
  constructor(private readonly submission: SubmissionService) {}

  /**
   * Public endpoint — no authentication required.
   * POST /api/submit/:slug  { "data": { "email": "...", "message": "..." } }
   *
   * Rate-limited to 20 submissions per minute per IP to prevent flooding.
   */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post(':slug')
  @ApiOperation({
    summary: 'Submit a form (public)',
    description:
      'No auth required. Validates against form schema, stores submission, and fires configured actions. Rate-limited to 20/min per IP.',
  })
  @ApiParam({ name: 'slug', description: 'Form slug as configured in the admin panel' })
  submit(
    @Param('slug') slug: string,
    @Body() dto: SubmitFormDto,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress;
    return this.submission.submit(slug, dto.data, ip);
  }
}
