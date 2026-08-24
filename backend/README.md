# NodePress Backend

NestJS + PostgreSQL + Prisma — REST, GraphQL, and WebSocket API for the NodePress headless CMS.

> **New to NodePress?** Use the CLI instead: `npx create-nodepress-app my-project`
> Full setup guide: [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com/)

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

## Dynamic REST API & Advanced Filtering

Every content type created in NodePress gets high-performance REST endpoints under `/api/:typeName`:

### Filtering & Query Parameters

| Parameter | Example | Description |
|---|---|---|
| `where` | `?where[price][gte]=100` | Advanced nested filtering on schema fields |
| `where[x][operator]` | `?where[category][in]=tech,news` | Supported operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `in`, `notIn`, `null`, `notNull` |
| `OR` / `AND` | `?where[OR][0][price][lt]=50&where[OR][1][featured][eq]=true` | Logical combinators for complex matching |
| `fields` | `?fields=title,slug,thumbnail` | Field projection — returns only listed payload keys |
| `populate` | `?populate=author,author.company` | $O(\text{depth})$ batched relation hydration (dot-notation up to 3 levels deep) |
| `sort` | `?sort=createdAt:desc` | Sort field & direction (`createdAt`, `updatedAt`, `slug`) |
| `search` | `?search=keyword` | PostgreSQL indexed GIN full-text search with DB-level limit pagination |
| `locale` | `?locale=es` | Multi-locale language filter |
| `page` / `limit` | `?page=1&limit=20` | Pagination controls (max limit: 100) |

---

## Dynamic Image Optimization Pipeline

NodePress includes on-the-fly Sharp image processing with disk caching:

```http
GET /api/media/:filename/transform?w=800&h=600&q=80&format=webp&fit=cover
GET /api/media/:filename/resize?w=400
```

- **Query Parameters**:
  - `w`: Target width in pixels (1–3840)
  - `h`: Target height in pixels (1–3840)
  - `q`: Quality level 1–100 (default: 80)
  - `format`: Output format (`webp`, `avif`, `jpeg`, `png`)
  - `fit`: Crop mode (`cover`, `contain`, `fill`, `inside`, `outside`)
- **Caching**: Generated variants are cached to `uploads/.cache/variants/` and served with `Cache-Control: public, max-age=31536000, immutable`.

---

## Cloud Storage Setup (S3 / Cloudflare R2 / MinIO)

To switch from local disk storage to cloud object storage, set `STORAGE_DRIVER=s3` in `backend/.env`:

### 1. Cloudflare R2 (Recommended — Zero Egress Fees)
```env
STORAGE_DRIVER=s3
STORAGE_S3_BUCKET=my-r2-bucket
STORAGE_S3_REGION=auto
STORAGE_S3_ACCESS_KEY=your_r2_access_key_id
STORAGE_S3_SECRET_KEY=your_r2_secret_access_key
STORAGE_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
# Custom domain or public R2 URL (enable 'Public Access' in Cloudflare R2 dashboard):
STORAGE_S3_PUBLIC_URL=https://assets.yourdomain.com
```

### 2. AWS S3
```env
STORAGE_DRIVER=s3
STORAGE_S3_BUCKET=my-s3-bucket
STORAGE_S3_REGION=us-east-1
STORAGE_S3_ACCESS_KEY=AKIAXXXXXXXXXXXXXXXX
STORAGE_S3_SECRET_KEY=your_aws_secret_access_key
# Optional: CloudFront CDN distribution domain
STORAGE_S3_PUBLIC_URL=https://d111111abcdef8.cloudfront.net
```

### 3. MinIO (Self-Hosted / Local Docker)
```env
STORAGE_DRIVER=s3
STORAGE_S3_BUCKET=nodepress-uploads
STORAGE_S3_REGION=us-east-1
STORAGE_S3_ACCESS_KEY=minioadmin
STORAGE_S3_SECRET_KEY=minioadmin
STORAGE_S3_ENDPOINT=http://localhost:9000
STORAGE_S3_PUBLIC_URL=http://localhost:9000/nodepress-uploads
```

### 4. DigitalOcean Spaces
```env
STORAGE_DRIVER=s3
STORAGE_S3_BUCKET=my-space-name
STORAGE_S3_REGION=nyc3
STORAGE_S3_ACCESS_KEY=your_spaces_key
STORAGE_S3_SECRET_KEY=your_spaces_secret
STORAGE_S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
STORAGE_S3_PUBLIC_URL=https://my-space-name.nyc3.cdn.digitaloceanspaces.com
```

---

## Automated SEO & Structured Data (JSON-LD)

NodePress delivers automatic SEO metadata, dynamic sitemaps, and Schema.org rich snippets:

- **Dynamic Sitemap**: `GET /api/sitemap.xml` (excludes entries flagged `seo.noIndex`)
- **Dynamic Robots**: `GET /api/robots.txt` (configured via `ROBOTS_DISALLOW`)
- **Per-Entry SEO Payload**: `GET /api/:type/:slug` returns:
  ```json
  {
    "seo": {
      "title": "Article Title",
      "description": "Meta description (160 char max)",
      "image": "https://assets.yourdomain.com/og-cover.webp",
      "noIndex": false
    }
  }
  ```
- **Next.js Integration**: Automatically mapped to `generateMetadata()` and Schema.org `<script type="application/ld+json">` for `Article` and `BreadcrumbList` rich snippets.

---

## Field-Level Security (RBAC/PBAC)

Fields support granular access policies:
- `readRoles: ['admin', 'editor']`: Automatically strips the field from public Dynamic API responses and hides it from unauthorized roles.
- `writeRoles: ['admin']`: Prevents non-authorized roles from modifying the field, throwing `403 Forbidden` if an edit is attempted.

---

## Modular Plugin Hook & Filter Bus

Plugins can subscribe to lifecycle actions and data pipelines via `PluginHookBus`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PluginHookBus, PluginEvents } from '../plugin/plugin-sdk';

@Injectable()
export class MyPluginService implements OnModuleInit {
  constructor(private hookBus: PluginHookBus) {}

  onModuleInit() {
    // 1. Listen to lifecycle actions in priority order
    this.hookBus.on(PluginEvents.ENTRY_AFTER_CREATE, async (payload) => {
      console.log('New entry created:', payload.slug);
    }, 10, 'my-plugin');

    // 2. Register data filter transformers
    this.hookBus.addFilter('entry.title', (title: string) => {
      return title.trim().toUpperCase();
    }, 10, 'my-plugin');
  }
}
```

### Supported Lifecycle Events
- `entry.beforeCreate` / `entry.afterCreate`
- `entry.beforeUpdate` / `entry.afterUpdate`
- `entry.beforeDelete` / `entry.afterDelete`
- `entry.beforePublish` / `entry.afterPublish`

---

## Testing

```bash
# Unit tests (24 test suites)
npm test

# E2E tests (requires running PostgreSQL + Redis)
npm run test:e2e

# Type-check only
npx tsc --noEmit
```
