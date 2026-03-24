# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

NodePress is a self-hosted headless CMS (WordPress + ACF + Strapi inspired) with:
- **Backend**: NestJS + PostgreSQL + Prisma ORM — `backend/`
- **Frontend**: Next.js 14 App Router + Ant Design admin panel — `frontend/`

Both are separate npm projects. Always `cd` into the correct directory before running commands.

---

## Commands

### Backend (`cd backend/`)

```bash
npm run start:dev      # Dev server with hot reload (port 3000)
npm run build          # Compile TypeScript to dist/
npm run start:prod     # Run compiled output
npx tsc --noEmit       # Type-check without building
npx prisma migrate dev --name <name>   # Create + apply a migration
npx prisma studio      # Visual DB browser
npx prisma generate    # Regenerate Prisma client after schema changes
```

### Frontend (`cd frontend/`)

```bash
npm run dev            # Dev server (port 5173)
npm run build          # Production build
npx tsc --noEmit       # Type-check without building
```

### Environment files

- `backend/.env` — `DATABASE_URL`, `DIRECT_URL`, `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `APP_URL`, `SITE_URL`, `LOG_LEVEL`, `STORAGE_DRIVER`, `REDIS_URL` (optional), `METRICS_TOKEN` (optional), `SENTRY_DSN` (optional), `SMTP_*` (optional)
- `frontend/.env.local` — `BACKEND_URL=http://localhost:3000` (used only in server components), `NEXT_PUBLIC_SENTRY_DSN` (optional)
- See `backend/.env.example` and `frontend/.env.local.example` for full documentation of all variables.

---

## Architecture

### Backend module structure

```
src/
  main.ts                  # Entry point — dotenv loaded HERE, then instrument.ts (Sentry), then bootstrap
  instrument.ts            # Sentry init — imported first in main.ts before all other imports
  app.module.ts            # Root module — DynamicApiModule imported LAST (wildcard routing)
  prisma/                  # PrismaService (OnModuleInit/OnModuleDestroy)
  auth/                    # JWT auth: register, login, /me, setup-status, password reset
  content-type/            # CRUD for content type schemas
  entries/                 # CRUD for content entries (by contentTypeId) + versions + soft delete
  media/                   # File upload (Multer/diskStorage or S3) + Sharp optimization + list + delete
  dynamic-api/             # Wildcard /:type and /:type/:slug routes (public GET, guarded write) + cache
  api-keys/                # API key CRUD + ApiKeyGuard + JwtOrApiKeyGuard + ApiKeyRateLimitInterceptor
  cache/                   # AppCacheService — TTL cache (in-memory Map + optional Redis via ioredis)
  metrics/                 # Prometheus metrics — MetricsService (prom-client) + GET /api/metrics
  common/                  # SentryExceptionFilter, normalize, sanitize helpers
  forms/                   # Form builder + submissions + email/webhook actions
  webhooks/                # Webhook CRUD + delivery queue + retry with exponential backoff
  audit/                   # AuditLog write + list (resource, action, userId, ip)
  users/                   # User CRUD (admin only)
  health/                  # GET /api/health — DB connectivity check
  seo/                     # GET /api/sitemap.xml + GET /api/robots.txt
  scheduler/               # Cron job — auto-publishes entries when publishAt passes
```

**Critical ordering**: `DynamicApiModule` must be the **last import** in `app.module.ts`. Its `@Controller()` with no prefix uses wildcard params (`/:type`, `/:type/:slug`) that would shadow all static routes (`/entries`, `/media`, etc.) if registered first.

**dotenv must load first**: `main.ts` calls `dotenv.config()` before any `import` statements. `JwtModule.registerAsync()` (not `register()`) is used so `JWT_SECRET` is read lazily inside a factory function after dotenv runs.

### Database schema (Prisma)

Three models:
- `ContentType` — `name` (unique, normalized to snake_case), `schema` (Json array of field definitions)
- `Entry` — `slug` + `contentTypeId` (composite unique), `data` (Json, stores all field values)
- `User` — `email` (unique), `password` (bcrypt), `role`
- `ApiKey` — `key` (unique, `np_` prefix + 48 hex chars), `permissions` (Json: `{access, contentTypes}`)

Content type names are normalized via `normalizeName()` (lowercase + underscores). Reserved names (`auth`, `media`, `entries`, `content-types`, `uploads`) are blocked.

### Auth system

- **JWT** via `@nestjs/passport` + `passport-jwt`. Token sent as `Authorization: Bearer <token>`.
- **API Keys** via `X-API-Key` header. Two guards:
  - `ApiKeyGuard` — API key only (used on `api-keys` management routes? No — those use JWT)
  - `JwtOrApiKeyGuard` — accepts either JWT or a write/all API key. Used on dynamic-api write routes.
- **Per-key rate limiting** via `ApiKeyRateLimitInterceptor` (global): read=120 req/min, write=60 req/min, all=120 req/min. Returns `X-RateLimit-Limit/Remaining/Reset` headers. JWT requests are exempt.
- **Setup flow**: `POST /api/auth/register` only works when zero users exist. After setup, it returns 409. Frontend `/setup` page checks `GET /api/auth/setup-status` on load.
- Login page redirects to `/setup` if `{ required: true }`.

### Frontend routing (Next.js App Router)

Three route groups:
- `(auth)` — `/login`, `/setup` — no layout wrapper
- `(admin)` — `/`, `/content-types`, `/entries`, `/media`, `/api-keys` — protected by middleware + sidebar layout
- `(public)` — `/[type]`, `/[type]/[slug]` — server components, fetch from `BACKEND_URL` directly

**Middleware** (`middleware.ts`) protects `ADMIN_PATHS` list. Public routes and `/setup` pass through freely. Already-logged-in users are redirected away from `/login` and `/setup`.

**API proxy**: `next.config.js` rewrites `/api/*` → `http://localhost:3000/api/*` and `/uploads/*` → `http://localhost:3000/uploads/*`. This only works client-side. Server components must use `BACKEND_URL` env var directly.

**Auth storage**: JWT stored in cookie `np_token` (readable by middleware server-side). User object in `localStorage`. `lib/axios.ts` reads `Cookies.get('np_token')` for the `Authorization` header.

### Dynamic form field system

Entries use a schema-driven form. Field types and their renderers:

| Type | Renderer |
|---|---|
| `text` | `Input` |
| `textarea` | `Input.TextArea` |
| `richtext` | `RichTextEditor` (TipTap, loaded via `next/dynamic` with `ssr: false`) |
| `number` | `InputNumber` |
| `boolean` | `Switch` (uses `valuePropName="checked"`) |
| `select` | `Select` with options from field config |
| `image` | `Input` + live preview |
| `repeater` | `RepeaterField` — `Form.List` with sub-fields |
| `flexible` | `FlexibleField` — `Form.List` + `useWatch` per item for layout switching |

Slug auto-generation: watches the first `text`/`textarea` field. Stops auto-generating once the user manually edits the slug field (`slugManualRef`). Slug is locked (disabled) when editing an existing entry.

### Media uploads

Multer `diskStorage` saves files to `backend/uploads/`. Allowed types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`, `video/mp4`. Max 10MB. Filenames: `{timestamp}-{8-random-hex}{ext}`.

`MediaService.safeResolvePath()` guards against path traversal: strips directories with `basename()`, resolves to absolute path, checks it starts with `uploadsDir`.

### API key permissions shape

```json
{ "access": "read" | "write" | "all", "contentTypes": ["blog", "pages"] | ["*"] }
```

`JwtOrApiKeyGuard` enforces: read keys blocked on write routes; content-type-restricted keys blocked for non-matching `req.params.type`.

---

## Documentation maintenance

The documentation page lives at `frontend/app/(docs)/docs/page.tsx` and is accessible at `/docs`.

**Whenever a product change is made, update the docs page to reflect it.** This includes:

- Adding a new field type → update the Field Types table
- Adding/changing/removing an API endpoint → update the API Reference section
- Adding a new feature (duplicate, export/import, drag-and-drop, etc.) → update the relevant section
- Changing how slugs, names, or keys are normalized → update the relevant explanation
- Adding a new admin page or nav item → update the Quick Start or relevant section
- Changing media upload limits or allowed file types → update the Media section
- Any change to API key permissions or behaviour → update the API Keys section

The docs page also has a **"Your Endpoints"** live section that fetches real content types — no update needed there, it's dynamic.

---

## Key conventions

- **Content type names** are always stored lowercased and snake_cased. The dynamic API normalizes `typeName.toLowerCase()` so `/api/Blog` resolves to content type `blog`.
- **Prisma `^5.22.0`** — not v7+. The v7 datasource `url` field syntax breaks this project.
- **`@IsOptional()` on DTO optional fields** — required because `ValidationPipe` runs with `forbidNonWhitelisted: true`. Any field without a decorator causes a 400 error.
- **`DynamicApiModule` imports both `ApiKeysModule` and `AuthModule`** — needed because `JwtOrApiKeyGuard` (provided in `ApiKeysModule`) depends on `JwtService` which comes from `AuthModule`'s exported `JwtModule`.
- **Frontend `tsconfig.json` excludes `src/` and `vite.config.ts`** — leftover Vite files that must not be compiled by Next.js.
- **Site name** entered during setup is stored in `localStorage` as `np_site_name` and displayed in the admin sidebar.
