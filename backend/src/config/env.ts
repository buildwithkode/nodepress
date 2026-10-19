import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  DATABASE_REPLICA_URL: z.string().url('DATABASE_REPLICA_URL must be a valid URL').optional(),
  JWT_SECRET:      z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN:  z.string().default('7d'),
  PORT:            z.coerce.number().default(3000),
  NODE_ENV:        z.enum(['development', 'production', 'test']).default('development'),

  // CORS_ORIGIN is required — no silent localhost fallback in production.
  // Supports comma-separated origins: "https://app.com,https://staging.app.com"
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),

  LOG_LEVEL:      z.enum(['debug', 'info', 'warn', 'error']).optional(),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  APP_URL:        z.string().url().optional(),
  SITE_URL:       z.string().url().optional(),

  // Redis — optional, validated if present
  REDIS_URL: z.string().url().optional(),

  // Express `trust proxy` — which upstream proxies may set X-Forwarded-For.
  // Default trusts private-network hops only (Docker nginx, k8s ingress), so
  // req.ip is the real client and per-IP rate limits/audit logs work, while a
  // directly exposed server can't be spoofed. Behind a CDN that terminates on a
  // public IP (e.g. Cloudflare → nginx), set a hop count such as "2".
  TRUST_PROXY: z.string().default('loopback, linklocal, uniquelocal'),

  // S3 — required when STORAGE_DRIVER=s3 (must match what s3.adapter.ts reads)
  STORAGE_S3_BUCKET:      z.string().optional(),
  STORAGE_S3_REGION:      z.string().optional(),
  STORAGE_S3_ACCESS_KEY:  z.string().optional(),
  STORAGE_S3_SECRET_KEY:  z.string().optional(),
  STORAGE_S3_ENDPOINT:    z.string().optional(),
  STORAGE_S3_PUBLIC_URL:  z.string().optional(),

  // Sentry — optional
  SENTRY_DSN: z.string().url().optional(),

  // SMTP — optional
  SMTP_HOST:   z.string().optional(),
  SMTP_PORT:   z.coerce.number().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER:   z.string().optional(),
  SMTP_PASS:   z.string().optional(),
  SMTP_FROM:   z.string().optional(),

  // Metrics endpoint bearer token — optional
  METRICS_TOKEN: z.string().optional(),

  // Captcha — optional spam protection for public form submissions
  // CAPTCHA_PROVIDER: 'turnstile' (Cloudflare) | 'hcaptcha' | 'recaptcha'
  // CAPTCHA_SECRET_KEY: server-side secret from your captcha provider dashboard
  CAPTCHA_PROVIDER:   z.enum(['turnstile', 'hcaptcha', 'recaptcha']).optional(),
  CAPTCHA_SECRET_KEY: z.string().optional(),

  // Audit log retention in days — default 90
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

  // Background queues — webhook deliveries (webhook_deliveries) and jobs such as
  // form actions (jobs), both claimed with SKIP LOCKED. Every instance runs the
  // workers unless QUEUE_WORKER=false (e.g. API-only replicas).
  QUEUE_WORKER:        z.enum(['true', 'false']).default('true'),
  QUEUE_POLL_MS:       z.coerce.number().int().positive().default(1000), // how often an idle worker checks for due work
  WEBHOOK_CONCURRENCY: z.coerce.number().int().positive().default(10),   // webhook deliveries in flight per instance
  JOB_CONCURRENCY:     z.coerce.number().int().positive().default(5),    // jobs (form emails/webhooks…) in flight per instance

  // Single sign-on via OpenID Connect (auth/oidc.service.ts) — Google,
  // Microsoft Entra ID, Okta, Auth0, Keycloak… Enabled when OIDC_ISSUER is set.
  OIDC_ISSUER:          z.string().url().optional(),   // e.g. https://accounts.google.com
  OIDC_CLIENT_ID:       z.string().optional(),
  OIDC_CLIENT_SECRET:   z.string().optional(),
  OIDC_PROVIDER_NAME:   z.string().default('SSO'),     // login button label: "Continue with <name>"
  OIDC_SCOPES:          z.string().default('openid email profile'),
  OIDC_REDIRECT_URI:    z.string().url().optional(),   // default: <SITE_URL>/api/auth/oidc/callback (through the admin's /api proxy)
  OIDC_ALLOWED_DOMAINS: z.string().optional(),         // comma-separated email domains; empty = any
  OIDC_AUTO_CREATE:     z.enum(['true', 'false']).default('false'), // create unknown users (else invite-only)
  OIDC_DEFAULT_ROLE:    z.enum(['admin', 'editor', 'contributor', 'viewer']).default('viewer'),
  OIDC_ROLE_CLAIM:      z.string().optional(),         // e.g. "groups" or "roles"
  OIDC_ROLE_MAP:        z.string().optional(),         // e.g. "cms-admins:admin,cms-editors:editor"

  // On-the-fly image transforms (media/image-transform.service.ts)
  IMAGE_TRANSFORM_CONCURRENCY: z.coerce.number().int().positive().optional(), // default 2
  IMAGE_VARIANT_CACHE_MB:      z.coerce.number().int().positive().optional(), // default 2048

  // CDN in front of the public API. Public published reads carry Cache-Tag /
  // Surrogate-Key headers; on writes the matching tags are purged.
  CDN_PURGE_DRIVER:         z.enum(['none', 'cloudflare', 'fastly', 'webhook']).default('none'),
  CDN_CACHE_TTL:            z.coerce.number().int().nonnegative().optional(), // s-maxage; default 3600 with a purge driver, 30 without
  CLOUDFLARE_ZONE_ID:       z.string().optional(),
  CLOUDFLARE_API_TOKEN:     z.string().optional(),   // needs Zone → Cache Purge permission
  FASTLY_SERVICE_ID:        z.string().optional(),
  FASTLY_API_TOKEN:         z.string().optional(),   // needs purge_select scope
  CDN_PURGE_WEBHOOK_URL:    z.string().url().optional(),
  CDN_PURGE_WEBHOOK_SECRET: z.string().optional(),   // signs the body: X-NodePress-Signature: sha256=<hmac>

  // Public form submission guardrails — abuse protection for nested payloads.
  // Applied to every POST /api/submit/:slug before validation.
  FORM_MAX_DEPTH:         z.coerce.number().int().positive().default(3),      // max object/array nesting
  FORM_MAX_ARRAY_ITEMS:   z.coerce.number().int().positive().default(100),    // max items in any array field
  FORM_MAX_FIELDS:        z.coerce.number().int().positive().default(200),    // max total fields after flattening
  FORM_MAX_PAYLOAD_BYTES: z.coerce.number().int().positive().default(102400), // max JSON body size (~100 KB)
});

function validateEnv(raw: NodeJS.ProcessEnv) {
  const envToValidate = { ...raw };
  if (envToValidate.NODE_ENV === 'test' || process.env.NODE_ENV === 'test') {
    envToValidate.DATABASE_URL = envToValidate.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/nodepress_test';
    envToValidate.JWT_SECRET = envToValidate.JWT_SECRET || 'test-jwt-secret-must-be-at-least-32-chars-long-12345';
    envToValidate.CORS_ORIGIN = envToValidate.CORS_ORIGIN || 'http://localhost:3000';
  }

  // Dev only: if APP_URL is unset or points at localhost, sync it to the active PORT
  // so changing PORT in .env doesn't leave media URLs on the old port.
  if (envToValidate.NODE_ENV !== 'production') {
    const port = envToValidate.PORT || 3000;
    if (!envToValidate.APP_URL || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(envToValidate.APP_URL)) {
      envToValidate.APP_URL = `http://localhost:${port}`;
    }
  }

  const result = EnvSchema.safeParse(envToValidate);

  if (!result.success) {
    console.error('\n❌  Invalid environment variables — fix these before starting:\n');
    result.error.issues.forEach((issue) => {
      const path = issue.path.join('.');
      console.error(`   ${path}: ${issue.message}`);
    });
    console.error('\nSee backend/.env.example for documentation on all variables.\n');
    process.exit(1);
  }

  // Extra validation: captcha provider requires a secret key
  const data = result.data;
  if (data.CAPTCHA_PROVIDER && !data.CAPTCHA_SECRET_KEY) {
    console.error(`\n❌  CAPTCHA_PROVIDER=${data.CAPTCHA_PROVIDER} requires CAPTCHA_SECRET_KEY to be set\n`);
    process.exit(1);
  }

  // Extra validation: OIDC needs a client id and secret once an issuer is set
  if (data.OIDC_ISSUER && (!data.OIDC_CLIENT_ID || !data.OIDC_CLIENT_SECRET)) {
    console.error('\n❌  OIDC_ISSUER requires OIDC_CLIENT_ID and OIDC_CLIENT_SECRET\n');
    process.exit(1);
  }

  // Extra validation: a CDN purge driver needs its credentials
  const cdnRequired: Record<string, string[]> = {
    cloudflare: ['CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_API_TOKEN'],
    fastly: ['FASTLY_SERVICE_ID', 'FASTLY_API_TOKEN'],
    webhook: ['CDN_PURGE_WEBHOOK_URL'],
  };
  const cdnMissing = (cdnRequired[data.CDN_PURGE_DRIVER] ?? []).filter((k) => !data[k as keyof typeof data]);
  if (cdnMissing.length) {
    console.error(`\n❌  CDN_PURGE_DRIVER=${data.CDN_PURGE_DRIVER} requires: ${cdnMissing.join(', ')}\n`);
    process.exit(1);
  }

  // Extra validation: S3 driver requires bucket + credentials
  if (data.STORAGE_DRIVER === 's3') {
    const missing = ['STORAGE_S3_BUCKET', 'STORAGE_S3_ACCESS_KEY', 'STORAGE_S3_SECRET_KEY'].filter(
      (k) => !data[k as keyof typeof data],
    );
    if (missing.length > 0) {
      console.error(`\n❌  STORAGE_DRIVER=s3 requires: ${missing.join(', ')}\n`);
      process.exit(1);
    }
  }

  return data;
}

export const env = validateEnv(process.env);
export type Env = typeof env;
