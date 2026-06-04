/**
 * Sentry instrumentation — must be imported FIRST in main.ts (before any other import).
 *
 * Sentry is OPTIONAL. It only activates when SENTRY_DSN is set AND the optional
 * `@sentry/*` packages are installed. Projects scaffolded without `--sentry` omit
 * those packages, so the indirect `require()` below simply fails and is ignored —
 * the app runs normally with error tracking disabled.
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  try {
    // Indirect (variable) specifiers so the compiler/bundler does NOT treat the
    // optional Sentry packages as a hard build-time dependency. When they aren't
    // installed, these requires throw and we fall through to the catch.
    const sentryPkg = '@sentry/nestjs';
    const profilingPkg = '@sentry/profiling-node';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require(sentryPkg);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { nodeProfilingIntegration } = require(profilingPkg);

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
  } catch {
    // @sentry/* not installed (scaffolded without --sentry) — skip silently.
    // eslint-disable-next-line no-console
    console.warn(
      '[instrument] SENTRY_DSN is set but @sentry/nestjs is not installed — ' +
        'error tracking is disabled. Re-scaffold with --sentry or install the @sentry/* packages.',
    );
  }
}
