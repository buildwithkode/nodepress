/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');

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

// Wrap with Sentry only when NEXT_PUBLIC_SENTRY_DSN is set.
// When not set (local dev / CI), next.config works as normal — no SDK overhead.
module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,                 // Suppress Sentry CLI output during builds
      disableLogger: true,          // Tree-shake Sentry logger in production bundle
      widenClientFileUpload: true,  // Upload source maps for readable stack traces
    })
  : nextConfig;
