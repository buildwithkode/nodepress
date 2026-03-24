/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
      {
        source: '/uploads/:path*',
        destination: 'http://localhost:3000/uploads/:path*',
      },
    ];
  },
};

// Wrap with Sentry only when NEXT_PUBLIC_SENTRY_DSN is set.
// When not set (local dev / CI), next.config works as normal — no SDK overhead.
module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,                 // Suppress Sentry CLI output during builds
      disableLogger: true,          // Tree-shake Sentry logger in production bundle
      widenClientFileUpload: true,  // Upload source maps for readable stack traces
    })
  : nextConfig;
