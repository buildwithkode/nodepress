import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  JWT_SECRET:      z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN:  z.string().default('15m'),
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
});

function validateEnv(raw: NodeJS.ProcessEnv) {
  const result = EnvSchema.safeParse(raw);

  if (!result.success) {
    console.error('\n❌  Invalid environment variables — fix these before starting:\n');
    result.error.issues.forEach((issue) => {
      const path = issue.path.join('.');
      console.error(`   ${path}: ${issue.message}`);
    });
    console.error('\nSee backend/.env.example for documentation on all variables.\n');
    process.exit(1);
  }

  // Extra validation: S3 driver requires bucket + credentials
  const data = result.data;
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
