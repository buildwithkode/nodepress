/**
 * Sentry instrumentation — must be imported FIRST in main.ts (before any other import).
 * Only activates when SENTRY_DSN env var is set. Safe to leave unconfigured in dev.
 */
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.npm_package_version,

    integrations: [
      nodeProfilingIntegration(),
    ],

    // Capture 100% of transactions in production for performance tracing.
    // Lower to 0.1 (10%) on high-traffic deployments to control volume/cost.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    profilesSampleRate: 1.0,

    // Don't send PII (user IPs, emails) unless explicitly enabled
    sendDefaultPii: false,
  });
}
