# NodePress Backend

NestJS + PostgreSQL + Prisma — REST, GraphQL, and WebSocket API for the NodePress headless CMS.

> **New to NodePress?** Use the CLI instead: `npx create-nodepress-app my-project`
> Full setup guide: [buildwithkode.github.io/nodepress](https://buildwithkode.github.io/nodepress/)

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally on port `5432`
  - Download: [postgresql.org/download](https://www.postgresql.org/download/)
  - During install: write down the password you set for the `postgres` user

---

## Setup

```bash
cp .env.example .env
```

Open `.env` and fill in the required fields:

```env
# Use the password you set when installing PostgreSQL
# If using Docker (docker-compose up -d), use: postgresql://postgres:devpassword@localhost:5432/YOUR_NODEPRESS_DATABASE
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE"

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=paste_a_64_char_random_string_here

# The URL of your frontend/admin panel
CORS_ORIGIN=http://localhost:5173
```

> **Didn't set a PostgreSQL password?** Try: `postgresql://postgres@localhost:5432/YOUR_NODEPRESS_DATABASE`

> **Using the CLI (`npx create-nodepress-app`)?** The `.env` is auto-generated but uses a random password. Update `DATABASE_URL` with your actual PostgreSQL password before running migrations.

---

## Install & Run

```bash
npm install

# Create database tables (run once)
npx prisma migrate dev

# Start development server
npm run start:dev
```

- REST API: `http://localhost:3000/api`
- GraphQL: `http://localhost:3000/api/graphql`
- WebSocket: `ws://localhost:3000/api/realtime`
- Swagger docs: `http://localhost:3000/api/docs`
- Health check: `http://localhost:3000/api/health`
- Metrics: `http://localhost:3000/api/metrics`

---

## Commands

| Command | Description |
|---|---|
| `npm run start:dev` | Dev server with hot reload (port 3000) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start:prod` | Run compiled output |
| `npx tsc --noEmit` | Type-check without building |
| `npx prisma migrate dev --name <name>` | Create and apply a migration |
| `npx prisma generate` | Regenerate Prisma client after schema changes |
| `npx prisma studio` | Visual database browser |

---

## Environment variables

See `.env.example` for all available variables.

**Required:**

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Min 32 characters — signs auth tokens |
| `CORS_ORIGIN` | Allowed frontend origin (no trailing slash) |

**Optional:**

| Variable | Description |
|---|---|
| `PORT` | Defaults to `3000` |
| `APP_URL` | Public backend URL — used in uploaded file URLs |
| `SITE_URL` | Public frontend URL — used in sitemap/robots.txt |
| `REDIS_URL` | Enables shared Redis cache (in-memory by default) |
| `STORAGE_DRIVER` | `local` (default) or `s3` |
| `STORAGE_S3_BUCKET` / `STORAGE_S3_REGION` / `STORAGE_S3_ACCESS_KEY` / `STORAGE_S3_SECRET_KEY` | S3 storage credentials |
| `STORAGE_S3_ENDPOINT` | Custom S3 endpoint for R2/MinIO |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP for password reset + form emails |
| `SENTRY_DSN` | Sentry error tracking |
| `METRICS_TOKEN` | Bearer token to protect `/api/metrics` |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` (default: `debug` in dev, `info` in prod) |
| `DIRECT_URL` | Direct DB URL for Prisma migrations when using PgBouncer |

---

## Module architecture

| Module | Path | Description |
|---|---|---|
| `AuthModule` | `src/auth/` | JWT auth, refresh tokens, password reset |
| `UsersModule` | `src/users/` | User CRUD, role management |
| `PermissionsModule` | `src/permissions/` | Per-role, per-content-type action permissions |
| `ContentTypeModule` | `src/content-type/` | Schema builder, schema versioning |
| `EntriesModule` | `src/entries/` | Entry CRUD, versioning, soft delete, bulk ops |
| `DynamicApiModule` | `src/dynamic-api/` | Public REST API — `GET /api/:type/:slug` |
| `GraphqlModule` | `src/graphql/` | Apollo GraphQL — `/api/graphql` |
| `RealtimeModule` | `src/realtime/` | Socket.io WebSocket — `/api/realtime` |
| `MediaModule` | `src/media/` | File uploads, Sharp optimisation, S3/local |
| `ApiKeysModule` | `src/api-keys/` | API key CRUD + per-key rate limiting |
| `FormsModule` | `src/forms/` | Form builder + submissions |
| `WebhooksModule` | `src/webhooks/` | Webhook CRUD, delivery log, retry |
| `AuditModule` | `src/audit/` | Global audit log (non-blocking) |
| `SchedulerModule` | `src/scheduler/` | Cron: auto-publish, webhook retries, log pruning |
| `SeoModule` | `src/seo/` | Sitemap.xml + robots.txt |
| `HealthModule` | `src/health/` | `GET /api/health` — DB + Redis ping |
| `MetricsModule` | `src/metrics/` | Prometheus `GET /api/metrics` |
| `AppCacheModule` | `src/cache/` | Redis / in-memory TTL cache |
| `PluginModule` | `src/plugin/` | Plugin registry + `GET /api/plugins` |

---

## Testing

```bash
# Unit tests
npm test

# E2E tests (requires running PostgreSQL + Redis)
npm run test:e2e

# Type-check only
npx tsc --noEmit
```

---

## Adding a plugin

1. Create `src/plugins/<name>/` with `manifest.ts`, `<name>.service.ts`, `<name>.module.ts`, `index.ts`
2. Register in `src/plugin/plugins.config.ts`

See `src/plugins/word-count/` for a complete example and `src/plugin/plugin-sdk.ts` for all available types.
