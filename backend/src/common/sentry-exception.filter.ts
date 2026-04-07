import { Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';

/**
 * Global exception filter that:
 * 1. Forwards all unhandled errors to Sentry (skips 4xx client errors — not our bugs)
 * 2. Delegates final HTTP response handling to NestJS's default BaseExceptionFilter
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Only capture server errors (5xx) — 4xx are client mistakes, not bugs
    if (status >= 500) {
      Sentry.captureException(exception);
    }

    // Let NestJS handle the HTTP response as normal
    super.catch(exception, host);
  }
}
