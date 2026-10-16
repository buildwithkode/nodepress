/** @type {import('next').NextConfig} */
const fs = require('fs');
const path = require('path');

// Dynamically resolve the backend URL:
// 1. If BACKEND_URL is explicitly configured to a non-localhost remote URL (e.g. production/docker), use it.
// 2. In local dev, auto-detect the backend's configured PORT from ../backend/.env so changing PORT just works.
// 3. Fallback to process.env.BACKEND_URL or http://localhost:3000.
function resolveBackendUrl() {
  const envUrl = process.env.BACKEND_URL;
  const isLocal = !envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1');

  if (isLocal) {
    try {
      const backendEnvPath = path.resolve(__dirname, '../backend/.env');
      if (fs.existsSync(backendEnvPath)) {
        const content = fs.readFileSync(backendEnvPath, 'utf8');
        const portMatch = content.match(/^\s*PORT\s*=\s*["']?(\d+)["']?/m);
        if (portMatch && portMatch[1]) {
          return `http://localhost:${portMatch[1]}`;
        }
      }
    } catch {
      // ignore read errors and fall through
    }
  }

  return envUrl || 'http://localhost:3000';
}

const BACKEND_URL = resolveBackendUrl();

// `env` values are inlined into the client bundle at build time. Only do that for a
// local backend: a remote BACKEND_URL may be an internal hostname (e.g. http://backend:3000
// in Docker) that browsers can't reach, so NEXT_PUBLIC_* must then be set explicitly.
const isLocalBackend = /localhost|127\.0\.0\.1/.test(BACKEND_URL);

const nextConfig = {
  env: isLocalBackend
    ? {
        BACKEND_URL,
        NEXT_PUBLIC_BACKEND_URL: BACKEND_URL,
        NEXT_PUBLIC_API_URL: BACKEND_URL,
      }
    : {},
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
