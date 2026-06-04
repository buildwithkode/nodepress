/** @type {import('next').NextConfig} */

// BACKEND_URL is used server-side (server components) and here as the proxy target.
// In development this defaults to localhost:3000.
// In production set BACKEND_URL in your environment (e.g. https://api.yourdomain.com).
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
      {
        source: '/graphql',
        destination: `${BACKEND_URL}/graphql`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/graphql',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

// Wrap with Sentry only when NEXT_PUBLIC_SENTRY_DSN is set AND @sentry/nextjs is
// installed. Projects scaffolded without `--sentry` omit the package, so the
// require is done lazily inside a try/catch — when it's missing (or the DSN is
// unset) next.config works as normal with no SDK overhead and no build dependency.
let exported = nextConfig;
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  try {
    const { withSentryConfig } = require('@sentry/nextjs');
    exported = withSentryConfig(nextConfig, {
      silent: true,                 // Suppress Sentry CLI output during builds
      disableLogger: true,          // Tree-shake Sentry logger in production bundle
      widenClientFileUpload: true,  // Upload source maps for readable stack traces
    });
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      '[next.config] NEXT_PUBLIC_SENTRY_DSN is set but @sentry/nextjs is not installed — ' +
        'error tracking is disabled. Re-scaffold with --sentry or install @sentry/nextjs.',
    );
  }
}

module.exports = exported;
