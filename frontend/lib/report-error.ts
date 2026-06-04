/**
 * Optional client-side error reporting.
 *
 * Forwards an error to Sentry when @sentry/nextjs is installed AND initialised
 * (it sets `window.__SENTRY__` after `Sentry.init`). When Sentry is absent the
 * dynamic import simply rejects and is swallowed — the app is unaffected.
 *
 * NOTE: projects scaffolded without `--sentry` replace this file with a no-op
 * (the CLI rewrites it), so `next build` has no static `@sentry/nextjs` reference
 * to resolve. Keep the implementation here self-contained for that reason.
 */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !(window as { __SENTRY__?: unknown }).__SENTRY__) {
    return;
  }
  import('@sentry/nextjs')
    .then((m) => m.captureException(error as Error, { extra: context }))
    .catch(() => {
      /* @sentry/nextjs not available — ignore */
    });
}
