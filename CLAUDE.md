# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

NodePress is a self-hosted headless CMS (WordPress + ACF + Strapi inspired) with:
- **Backend**: NestJS + PostgreSQL + Prisma ORM — `backend/`
- **Frontend**: Next.js 14 App Router + Ant Design admin panel — `frontend/`
- **CLI**: `create-nodepress-app` — the published scaffolding tool — `cli/`

This is an **npm-workspaces** monorepo (`backend`, `frontend`, `cli`). A single root `npm install` installs all three. Most build/test commands still run per-package, so `cd` into the right directory first.

---

## Commands

### Root (monorepo)

```bash
npm install            # Installs all workspaces; postinstall runs `prisma generate`
npm run dev            # Runs backend + frontend together (concurrently)
npm run build          # Builds backend then frontend
npm run docker:dev     # docker-compose up -d (Postgres for local dev)
npm run docker:prod    # Production stack (Postgres + Redis + nginx)
npm run migrate        # cd backend && prisma migrate dev
npm run studio         # cd backend && prisma studio
```

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

Frontend dev/prod server runs on **port 5173** (`next dev -p 5173`).

### CLI (`cd cli/`)

Published as `create-nodepress-app` (currently v1.3.0). It is a zero-dependency Node script (`bin/nodepress.js` → `src/new.js`) that scaffolds a new project by **cloning GitHub `main`**, generating `.env` files with random secrets, and running install.

```bash
node bin/nodepress.js <project-name>            # Scaffold (local Postgres)
node bin/nodepress.js <project-name> --docker   # Scaffold with Docker (Postgres + Redis + nginx)
node bin/nodepress.js <project-name> --sentry   # Include Sentry (off by default)
```

Because the CLI clones `main`, **changes to backend/frontend only reach scaffolded users after they are pushed to `main`** — not when published. Only `cli/` changes require an `npm publish`.

### Pre-publish validation

CI/GitHub Actions is **disabled on this account**, so `scripts/validate.sh` is the only stability gate. Run it before publishing the CLI and before pushing `main`:

```bash
./scripts/validate.sh                  # A: working-tree build + B: scaffold smoke (no DB)
./scripts/validate.sh --no-scaffold    # A only (fast)
DATABASE_URL="postgresql://…/np_validate" ./scripts/validate.sh --smoke   # A + B + C runtime smoke
```

Layer B clones GitHub `main`, so run it **after pushing** for a faithful check of what users receive. The `--smoke` runtime layer creates and drops its own throwaway database — never point `DATABASE_URL` at a real DB.

### Environment files

- `backend/.env` — `DATABASE_URL`, `DIRECT_URL`, `PORT`, `JWT_SECRET` (**must be ≥32 chars** or env validation exits the process), `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `APP_URL`, `SITE_URL`, `LOG_LEVEL`, `STORAGE_DRIVER` (+ `STORAGE_S3_*` when `s3`), `REDIS_URL` (optional), `METRICS_TOKEN` (optional), `SENTRY_DSN` (optional), `SMTP_*` (optional), `CAPTCHA_PROVIDER`/`CAPTCHA_SECRET_KEY` (optional)
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
  config/                  # Zod env validation — config/env.ts exits the process on invalid/missing env (e.g. JWT_SECRET < 32 chars)
  prisma/                  # PrismaService (OnModuleInit/OnModuleDestroy)
  auth/                    # JWT access tokens + HttpOnly refresh-cookie rotation, register, login, /me, setup-status, password reset
  content-type/            # CRUD for content type schemas (+ schema versions)
  entries/                 # CRUD for content entries (by contentTypeId) + versions + soft delete
  fields/                  # FieldDef types + FIELD_TYPES registry (single source of truth for valid field types)
  media/                   # File upload (Multer) → pluggable StorageAdapter (local disk or S3) + Sharp WebP optimization + folders
  dynamic-api/             # Wildcard /:type and /:type/:slug routes (public GET, guarded write) + cache + relation ?populate=
  graphql/                 # Auto-generated GraphQL schema over content types (Apollo)
  api-keys/                # API key CRUD + ApiKeyGuard + JwtOrApiKeyGuard + ApiKeyRateLimitInterceptor
  cache/                   # AppCacheService — TTL cache (in-memory Map + optional Redis via ioredis)
  metrics/                 # Prometheus metrics — MetricsService (prom-client) + GET /api/metrics
  realtime/                # Socket.io gateway — live media/entry events (optional Redis adapter for multi-instance)
  mail/                    # MailService — SMTP (nodemailer) for password reset, invites, form email actions; reads brand from BrandService
  brand/                   # Install brand singleton (name/logo/color) — GET /api/brand (public) + PUT (admin only)
  permissions/             # Granular role/permission records (Permission model)
  plugin/ plugins/         # Plugin loader + bundled plugins
  common/                  # SentryExceptionFilter, normalize, sanitize, populate.util helpers
  forms/                   # Form builder + submissions + email/webhook actions + captcha verification
  webhooks/                # Webhook CRUD + delivery queue + retry with exponential backoff
  audit/                   # AuditLog write + list (resource, action, userId, ip) + weekly retention prune
  users/                   # User CRUD (admin only)
  health/                  # GET /api/health — DB connectivity check
  seo/                     # GET /api/sitemap.xml + GET /api/robots.txt
  scheduler/               # Cron job — auto-publishes entries when publishAt passes
```

**Critical ordering**: `DynamicApiModule` must be the **last import** in `app.module.ts`. Its `@Controller()` with no prefix uses wildcard params (`/:type`, `/:type/:slug`) that would shadow all static routes (`/entries`, `/media`, etc.) if registered first.

**dotenv must load first**: `main.ts` calls `dotenv.config()` before any `import` statements. `JwtModule.registerAsync()` (not `register()`) is used so `JWT_SECRET` is read lazily inside a factory function after dotenv runs.

### Database schema (Prisma)

The core models:
- `ContentType` — `name` (unique, normalized to snake_case), `schema` (Json array of field definitions); `ContentTypeSchemaVersion` snapshots schema history
- `Entry` — `slug` + `contentTypeId` (composite unique), `data` (Json, all field values), `publicId` (UUID — the stable id relations point to), soft-deleted via `deletedAt`; `EntryVersion` snapshots data history
- `User` — `email` (unique), `password` (bcrypt), `role`; `Permission` holds granular grants; `RefreshToken` / `PasswordResetToken` back the auth flows
- `ApiKey` — `key` (unique, `np_` prefix + 48 hex chars), `permissions` (Json: `{access, contentTypes}`)
- `Media` + `MediaFolder` — uploaded-file metadata (URLs, dimensions, WebP sibling) and the virtual folder tree
- `Form` + `FormSubmission`, `Webhook` + `WebhookDelivery`, `AuditLog` — forms, webhook delivery queue, and audit trail
- `Setting` — **singleton (always row id=1)** holding the install brand (`brandName`, `brandLogoUrl`, `brandColor`); managed via `GET/PUT /api/brand`

Run `grep '^model' backend/prisma/schema.prisma` for the full list. Content type names are normalized via `normalizeName()` (lowercase + underscores). Reserved names (`auth`, `media`, `entries`, `content-types`, `uploads`) are blocked.

### Relations & `?populate=`

Relation fields store the target entry's `publicId` (UUID), not its numeric id. A public GET resolves them only when asked: `GET /api/blog/my-post?populate=author`. `common/populate.util.ts` (`populateDeep`) supports comma-separated and dot-notation nested paths (`?populate=author,author.company`) up to `MAX_DEPTH=3`, batching one `findMany` per level. **Cache caveat**: requests with `populate` or `fields` must bypass the cache entirely (read *and* write) — the cache key ignores those params, so serving a cached raw entry to a `?populate` request returns un-resolved UUIDs. The dynamic-api service guards this with a `cacheable` check.

### Auth system

- **JWT access tokens** via `@nestjs/passport` + `passport-jwt`. Token sent as `Authorization: Bearer <token>`, lifetime `JWT_EXPIRES_IN` (default 7d).
- **Refresh tokens**: login also sets an HttpOnly cookie `np_refresh` (30 days, `RefreshToken` model). `POST /api/auth/refresh` exchanges it for a new access token and **rotates** the refresh token (old one deleted); `POST /api/auth/logout` invalidates and clears it.
- **API Keys** via `X-API-Key` header. Two guards:
  - `ApiKeyGuard` — API key only (used on `api-keys` management routes? No — those use JWT)
  - `JwtOrApiKeyGuard` — accepts either JWT or a write/all API key. Used on dynamic-api write routes.
- **Per-key rate limiting** via `ApiKeyRateLimitInterceptor` (global): read=120 req/min, write=60 req/min, all=120 req/min. Returns `X-RateLimit-Limit/Remaining/Reset` headers. JWT requests are exempt.
- **Setup flow**: `POST /api/auth/register` only works when zero users exist. After setup, it returns 409. Frontend `/setup` page checks `GET /api/auth/setup-status` on load.
- Login page redirects to `/setup` if `{ required: true }`.

### Frontend routing (Next.js App Router)

Four route groups:
- `(auth)` — `/login`, `/setup` — no layout wrapper
- `(admin)` — protected by middleware + sidebar layout: `/` (dashboard), `/content-types`, `/entries`, `/media`, `/api-keys`, `/forms` (+ `/[id]/submissions`), `/webhooks` (+ `/deliveries`), `/users` (+ `/permissions`), `/audit-log`, `/brand` (admin-only)
- `(docs)` — `/docs` — the in-app documentation page
- `(public)` — `/[type]`, `/[type]/[slug]` — server components, fetch from `BACKEND_URL` directly

**Middleware** (`middleware.ts`) protects the `ADMIN_PATHS` list (keep it in sync when adding an admin page). `ADMIN_ONLY_PATHS` (e.g. `/users`, `/api-keys`, `/webhooks`, `/audit-log`, `/content-types/new`) further restrict to admin role. Public routes and `/setup` pass through freely; already-logged-in users are redirected away from `/login` and `/setup`.

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
| `image` | `MediaPickerModal` — upload (`POST /api/media/upload`) or pick from the media library; stores the selected URL |
| `relation` | picks a related entry; stores its `publicId` (UUID). `options: { relatedContentType, cardinality: 'one' \| 'many' }`. Resolve via `?populate=` |
| `color` | color picker |
| `date` / `datetime` | date / date-time picker |
| `json` | raw JSON editor |
| `repeater` | `RepeaterField` — `Form.List` with sub-fields |
| `flexible` | `FlexibleField` — `Form.List` + `useWatch` per item for layout switching |
| `group` | nested fixed group of sub-fields |

The canonical list lives in `backend/src/fields/field.types.ts` (`SIMPLE_FIELD_TYPES` + `COMPLEX_FIELD_TYPES`) — add new types there first.

Slug auto-generation: watches the first `text`/`textarea` field. Stops auto-generating once the user manually edits the slug field (`slugManualRef`). Slug is locked (disabled) when editing an existing entry.

### Media uploads & storage

Multer saves the incoming file to `backend/uploads/` first. Allowed types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`, `video/mp4`. Max 10MB. Filenames: `{timestamp}-{8-random-hex}{ext}`. Optimizable images are run through Sharp (resize + a **WebP sibling**), then a `Media` row records the URLs/dimensions.

**Pluggable storage** (`media/adapters/`, selected in `media.module.ts` by `STORAGE_DRIVER`):
- `local` (default) — bytes stay on disk in `backend/uploads/`; URL is `${APP_URL}/uploads/<file>` served by the backend.
- `s3` — `S3StorageAdapter` streams to any S3-compatible endpoint (AWS, Cloudflare R2, DigitalOcean Spaces, MinIO, B2), deletes the local temp file, and returns the bucket/CDN URL. The constructor **throws at boot** if `STORAGE_S3_BUCKET`/`ACCESS_KEY`/`SECRET_KEY` are missing — no silent fallback. R2/MinIO need `STORAGE_S3_ENDPOINT`; `STORAGE_S3_PUBLIC_URL` overrides the public base. Note R2 ignores the `public-read` ACL the adapter sets — its bucket must be made public separately.

**Production note**: `local` disk is ephemeral on PaaS (App Platform, containers without a volume) — a redeploy wipes `uploads/` while `Media` rows survive, breaking every image. Use `s3` or a persistent volume in production. (The Postgres DB is unaffected — it's an external managed service, not on the app filesystem.)

Path-traversal is blocked: deletes reject filenames containing `/`, `\`, or `..` and reduce everything to `basename()`.

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
- **Brand** (name, logo, accent color) is a server-side singleton (`Setting` model, `GET/PUT /api/brand`), edited at `Settings → Brand` (`/brand`, admin-only) and shared app-wide via `BrandProvider` (`context/BrandContext.tsx`) — it drives the admin sidebar, browser title/favicon, login/setup pages, the accent color (`--brand` CSS var), and form-submission emails. The site name entered at setup seeds the brand (a PUT after first registration). (Legacy `np_site_name` localStorage was removed.)
- **Theme overrides**: the `Setting` model also holds optional `buttonColor`/`inputColor` (nullable hex). `BrandProvider` converts hex → HSL triplet (`lib/color.ts`, since shadcn tokens are stored as `H S% L%`) and injects `--primary`/`--primary-foreground` (button, with auto-contrast text) and `--input`/`--ring` (input border + focus ring) onto `documentElement` at runtime; `null` removes the override so the built-in theme default applies. Edited in the **Theme** card on `/brand`.
