import { Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/**
 * Optional Sentry handle. Loaded lazily and indirectly so projects scaffolded
 * without `--sentry` (which omit @sentry/nestjs) still compile and run — the
 * require throws and we leave `sentry` null, making capture a no-op.
 */
let sentry: { captureException: (e: unknown) => void } | null = null;
try {
  const sentryPkg = '@sentry/nestjs';
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  sentry = require(sentryPkg);
} catch {
  sentry = null;
}

/**
 * Global exception filter that:
 * 1. Forwards all unhandled errors to Sentry (skips 4xx client errors — not our bugs)
 *    when Sentry is installed + initialised; otherwise this step is skipped.
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
    if (status >= 500 && sentry) {
      sentry.captureException(exception);
    }

    // Let NestJS handle the HTTP response as normal
    super.catch(exception, host);
  }
}
