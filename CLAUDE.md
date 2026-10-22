# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

NodePress is a self-hosted headless CMS (WordPress + ACF + Strapi inspired) with:
- **Backend**: NestJS + PostgreSQL + Prisma ORM — `backend/`
- **Frontend**: Next.js 15 App Router admin panel (shadcn/ui + Radix + Tailwind, React 18) — `frontend/`
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
npm run backup         # pg_dump + local uploads + manifest → backups/nodepress-<time>.tar.gz (scripts/backup.js)
npm run restore -- <file.tar.gz>   # guarded restore (type-the-name confirm, refuses non-empty DB / newer backup without --force)
```

### Pre-push gate and CI

`.githooks/pre-push` (installed by the root `prepare` script) type-checks both workspaces, runs backend unit tests, runs `npm audit --omit=dev --audit-level=high` **at the repo root** (all workspaces — the frontend matters: Next.js advisories), runs `scripts/check-docker-lockfiles.sh`, `scripts/check-licenses.js`, `scripts/check-versions.js`, `scripts/check-i18n.js` (admin translations complete in every language) and the `client/` build + tests. `scripts/check-licenses.js` fails on GPL/AGPL/SSPL, unknown or missing licences in production dependencies (LGPL/MPL are fine; reviewed exceptions live in its `REVIEWED` map with the reason) — NodePress is MIT and EcommPress is sold commercially. `.github/workflows/ci.yml` runs the same plus e2e (with a schema-drift check), the runtime smoke test and Docker image builds — but GitHub hasn't started an Actions run on this account since 2026-04-02, so the hook is what actually runs. Don't bypass it with `--no-verify` unless the user asks.

**Three lockfiles.** Local installs and CI use the root `package-lock.json`. The Docker images build with `backend/` or `frontend/` as the context, so they install from `backend/package-lock.json` / `frontend/package-lock.json` and ignore the root `overrides` — security overrides must be repeated in the workspace `package.json`, and an override of a direct dependency must use `"$name"`. After changing a workspace's dependencies, run `scripts/check-docker-lockfiles.sh --fix`. If `--fix` fails with `ERESOLVE` after a major upgrade, delete that package family's entries (e.g. all `node_modules/@tiptap/*`) from the workspace lockfile and run it again. Never delete the root lockfile; when npm ignores a new override, remove only the affected entry from the lockfile and reinstall.

### Backend (`cd backend/`)

```bash
npm run start:dev      # Dev server with hot reload (port = PORT in backend/.env, default 3000)
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
- `frontend/.env.local` — `BACKEND_URL` (server components + proxy target; in local dev it's overridden by the PORT auto-detection below), `NEXT_PUBLIC_API_URL` (browser → backend for the Socket.io connection; must be set explicitly when the backend is remote), `NEXT_PUBLIC_SENTRY_DSN` (optional)
- `APP_URL` is the **backend's** public URL; `SITE_URL` and `CORS_ORIGIN` are the **frontend's**. Never put the backend's own port in `CORS_ORIGIN`.
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
  graphql/                 # Code-first schema (Apollo) + typed per-content-type schema (content-schema.ts, served via ContentGraphqlService as Apollo's gateway)
  api-keys/                # API key CRUD + ApiKeyGuard + JwtOrApiKeyGuard + ApiKeyRateLimitInterceptor
  cache/                   # AppCacheService — TTL cache (in-memory Map + optional Redis via ioredis)
  metrics/                 # Prometheus metrics — MetricsService (prom-client) + GET /api/metrics
  realtime/                # Socket.io gateway — live media/entry events (optional Redis adapter for multi-instance)
  mail/                    # MailService — SMTP (nodemailer) for password reset, invites, form email actions; reads brand from BrandService
  brand/                   # Install brand singleton (name/logo/color) — GET /api/brand (public) + PUT (admin only)
  permissions/             # Granular role/permission records (Permission model)
  plugin/ plugins/         # Plugin loader + bundled plugins + PluginHookBus (lifecycle actions & data filters)
  common/                  # SentryExceptionFilter, normalize, sanitize, populate.util (O(depth) batch), field-security.util, filter-query.util (nested where), type-generator
  forms/                   # Form builder + submissions + email/webhook actions (queued as jobs) + captcha verification
  jobs/                    # Generic background job queue (jobs table) — JobsService.enqueue/registerHandler + JobWorker
  webhooks/                # Webhook CRUD + Postgres delivery queue (WebhookWorker, SKIP LOCKED) + retry with backoff
  audit/                   # AuditLog write + list (resource, action, userId, ip) + weekly retention prune
  users/                   # User CRUD (admin only)
  health/                  # GET /api/health — DB connectivity check
  seo/                     # GET /api/sitemap.xml + GET /api/robots.txt
  scheduler/               # Cron jobs — auto-publishes entries when publishAt passes, weekly pruning
  releases/                # Content releases — batches of publish/unpublish/archive applied in one transaction, now or on a schedule (own @Cron)
  templates/               # Starter templates (blog/agency/docs) — starter-templates.ts data + apply via ContentTypeService/EntriesService
  ai/                      # Optional AI help (ANTHROPIC_API_KEY): content model suggestions + entry drafts, structured outputs via @anthropic-ai/sdk
  search/                  # SearchService — optional Meilisearch driver (SEARCH_DRIVER), synced by `search.sync` jobs from the operation hook
  server-settings/         # Email (SMTP) + storage set from the admin; secrets sealed by common/secret-box.ts
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

### Scaling & production notes

- **Search** uses the generated `entries.search_vector` column (GIN index). It's declared in `schema.prisma` as `Unsupported("tsvector")` with a `dbgenerated(...)` default that must match Postgres' own rendering of the expression, or `prisma migrate diff` reports drift. Never write it from app code.
- **Pagination**: `?cursor=` keyset paging lives in `dynamic-api.service.ts` (`encodeCursor`/`cursorWhere`). Keep the predicate in the `field <= v AND (field < v OR id < c)` form — the textbook OR form can't use the index.
- **Multi-instance state** goes through Redis when `REDIS_URL` is set: cache (`AppCacheService`), throttler (`common/redis-throttler.storage.ts`), Socket.io adapter (set on the *root* server in `realtime.gateway.ts` — the gateway itself is a namespace).
- **`TRUST_PROXY`** must be right for the deployment, or per-IP rate limits and audit IPs see the proxy instead of clients.
- **CORS** rules live in one place, `common/cors-origin.ts`, shared by HTTP and Socket.io.
- **Public cache invalidation** is automatic and per content type: an operation hook (`PrismaService.onOperation()`) registered in `DynamicApiService.onModuleInit` bumps `dyn:generation:<contentTypeId>` for each content type an `Entry`/`ContentType` write touches, from any service, so other types stay cached. `dynamic-api/cache-scope.ts` works out the types from the write's args, its result, or (bulk writes by id) a lookup; when it can't, it bumps the global `dyn:generation`. Don't add per-call invalidation, and don't write entries through raw SQL or a client that bypasses `PrismaService`.
- **Webhook queue**: `WebhooksService.fire()` only inserts `webhook_deliveries` rows; `WebhookWorker` on every instance claims due rows with `FOR UPDATE SKIP LOCKED` (`claimDue()`), at most `WEBHOOK_CONCURRENCY` in flight. A claimed row stays `pending` with `attempts` already incremented and `nextRetryAt` pushed out as a 60 s lease, so a crashed worker's row is reclaimed automatically. Compare `nextRetryAt` against `now() AT TIME ZONE 'UTC'` in raw SQL — the column is `timestamp without time zone` holding UTC.
- **Background jobs** (`jobs/`): `JobsService.enqueue(type, payload)` inserts a `jobs` row; the module owning the type registers its handler with `registerHandler(type, fn)` in `onModuleInit` (form actions: `forms/actions/actions.service.ts`). A handler throws to be retried (1 min, then 10 min; `maxAttempts` default 3). Payloads are snapshots. `JobWorker` and `WebhookWorker` share the claim/lease/concurrency loop in `common/queue-runner.ts`; `QUEUE_WORKER=false` disables both on an instance. Done jobs are pruned after 7 days, failed after 30. Admins inspect and retry them at `/jobs` (`jobs.controller.ts`).
- **No Postgres session advisory locks**: Prisma pools connections, so `pg_advisory_unlock` can run on a different connection than the lock and leak it. Make cron jobs safe to run on every instance instead (conditional updates, idempotent deletes), as `scheduler.service.ts` does.
- **Unpublished stages need credentials**: `dynamic-api/stage-access.guard.ts` lets `published` reads through anonymously; `?stage=draft|staging|all` or `X-NodePress-Environment: staging` needs a JWT or an API key covering the type, and marks the response `private, no-store`. Never return unpublished entries from a route without this guard.
- **CDN caching** (`cdn/cdn-purge.service.ts`): public published reads get `s-maxage=cdnCacheTtl()` (from `HttpCacheInterceptor`, which never overrides a `private` header) and `Cache-Tag`/`Surrogate-Key` = `np-all`, `np-ct-<id>` (set in the controller). `DynamicApiService.invalidateScope()` calls `CdnPurgeService.schedule()`, which batches tags for 2 s into a `cdn.purge` job (`CDN_PURGE_DRIVER` cloudflare/fastly/webhook). Purge-all uses the `np-all` tag, never zone-wide purge.
- **Read replica** (`DATABASE_REPLICA_URL`): `PrismaService.readReplica` is the replica client or `null`. Use it only for lag-tolerant public reads (via `DynamicApiService.readClient()`, which also honours the read-after-write window). Prisma clients are proxies — never return `this` from a `PrismaService` getter; it's the raw target without model accessors.
- **Indexed fields** (`indexed: true` in a schema field): `content-type/field-index.service.ts` keeps one partial expression index `entries_f_<ctId>_<field>` per flagged field, matching the SQL Prisma emits for JSON path filters. It runs `CREATE INDEX CONCURRENTLY` in the background and never throws.
- **Query strings** are parsed by `common/query-parser.ts` (qs). Express 5's default "simple" parser silently drops nested params like `where[a][eq]`; the e2e `createTestApp()` sets the same parser.
- **nginx**: `nginx/proxy.conf` is mounted at `/etc/nginx/snippets/` — never under `conf.d/` (nginx includes those at the http level, where `location` is invalid). `/api/realtime` uses an `ip_hash` upstream; restart nginx after changing the backend replica count.
- **E2E tests** (`npm run test:e2e` in `backend/`) wipe every table. `test/jest.setup.ts` loads `backend/.env.test` before `.env` and refuses non-local database hosts — put a throwaway `DATABASE_URL` in `.env.test`. It also blanks `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` so tests never send real email (`E2E_ALLOW_SMTP=1` overrides) — blank, not deleted, because the Prisma client re-loads `.env` and would restore a deleted key.
- **`prisma db push` fails on this schema** (`cannot use column reference in DEFAULT expression`): `search_vector` is a generated column, which Prisma can only describe as a `dbgenerated` default. Use migrations (`migrate dev` / `migrate deploy`).
- **Schema changes need a migration.** `prisma db push` hides missing migrations — always check `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <throwaway>` is empty.

### Relations & `?populate=`

Relation fields store the target entry's `publicId` (UUID), not its numeric id. A public GET resolves them only when asked: `GET /api/blog/my-post?populate=author`. `common/populate.util.ts` (`populateManyDeep` / `populateDeep`) supports comma-separated and dot-notation nested paths (`?populate=author,author.company`) up to `MAX_DEPTH=3`, batching into a single `findMany` per relation depth ($O(\text{depth})$ complexity). **Cache caveat**: requests with `populate` or `fields` must bypass the cache entirely (read *and* write) — the cache key ignores those params, so serving a cached raw entry to a `?populate` request returns un-resolved UUIDs. The dynamic-api service guards this with a `cacheable` check.

**Reverse fields** (`options.mappedBy`, `isReverseRelation()` in `fields/field.types.ts`) are relation fields that store nothing: `populateReverse` in `populate.util.ts` finds the entries whose `mappedBy` field points at each owner (one LATERAL query, newest `REVERSE_LIMIT`=100 per owner) — so callers must pass `ownerIds` (publicIds, parallel to the data list). `ContentTypeService.assertReverseFields` checks the other side exists; `DataValidator` rejects writes to them. Public reads pass `publishedOnly: true` so drafts never leak through `?populate`. **Relation filters** (`?where[author][slug][eq]=…`) are resolved first by `common/relation-filter.util.ts` (max 1000 matching related entries) and become JSON equals / array_contains conditions.

### Advanced REST Query Engine & Filtering

`common/filter-query.util.ts` (`buildAdvancedWhere`) parses nested URL query parameters:
`?where[field][operator]=value` with full support for:
- Comparisons: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- Pattern matching: `contains`, `startsWith`, `endsWith`
- Set operations: `in`, `notIn`
- Nullability: `null`, `notNull`
- Combinators: `OR`, `AND` logical branches
- PostgreSQL indexed full-text search (`?search=term`) with database-pushed `LIMIT ${limit} OFFSET ${skip}` pagination.

### Field-Level Security (RBAC/PBAC)

`common/field-security.util.ts` enforces:
- `filterUnauthorizedReadFields(schema, data, userRole)`: Strips non-authorized fields from public & authenticated API responses.
- `validateFieldWritePermissions(schema, incomingData, userRole)`: Throws `ForbiddenException` if a non-authorized role attempts to mutate protected fields.

### Modular Plugin Hook & Filter Bus

`plugin/plugin-hook-bus.ts` provides a global priority-ordered event and filter pipeline (`hookBus.on()`, `hookBus.emit()`, `hookBus.addFilter()`, `hookBus.applyFilters()`). Handler failures are caught and logged without aborting core database transactions. Exposed at `GET /api/plugins/hooks`.

Plugins talk to the core through a scoped **`PluginContext`** (`plugin/plugin-context.ts`): the plugin module imports `PluginContextModule.forPlugin(manifest)` and services inject `@InjectPluginContext()`. `ctx.on()` checks the manifest permission for the event (`EVENT_PERMISSIONS` in `plugin/plugin-permissions.ts`) and throws at startup if it's missing. Only `PluginVetoError` thrown from a before-hook propagates (422); every other hook error is swallowed. `PluginEnabledGuard` (global) 404s the controllers of a disabled plugin's root module and of modules only that plugin imports (`PluginModule.mapPluginControllers`). `GET /api/plugins` returns settings to admins only, with `password` fields masked as `SECRET_MASK`. Manifests may declare a `nodepress` semver range; incompatible plugins stay disabled. When adding a new way to write entries, emit the entry hooks with a `source` (see `EntriesService.emitForEntries`). Hook-added data keys must be snake_case — `normalizeDataKeys` lowercases them on save.

**Uploaded plugins** (`plugin/plugin-loader.ts`, `plugin-package.ts`, `plugin-archive.ts`): admins upload a zip (`POST /api/plugins/packages`, `?dryRun=true` reviews) that is stored in `plugin_packages`. `AppModule` imports `pluginHostModule()` — a promise that loads bundled + uploaded plugins before Nest starts, unpacking packages into `PLUGINS_DIR` and patching `Module._resolveFilename` so plugin code gets `@nodepress/plugin-sdk` and `@nestjs/*`/Prisma/`rxjs` from the core (Jest uses `moduleNameMapper` + `modulePaths` instead). Install/update/delete take effect after a restart (`POST /api/plugins/restart` sends SIGTERM; a supervisor must start it again). `main.ts` calls `recordBootFailure()` when startup fails, which sets `loadError` on the uploaded package to blame so the next start skips it. Plugins are registered in `PluginModule`'s **constructor** — Nest runs a module class's `onModuleInit` after its providers', and `PluginService.onModuleInit` applies the saved on/off state. Signatures are Ed25519 over `packageMessage()`; the CLI (`cli/src/plugin.js`) has its own copy of the zip writer and signing and must stay in sync. e2e tests reboot with `createTestApp({ reloadPlugins: true })`.

### TypeScript Codegen & Next.js Live Preview

- CLI: `npx nodepress generate:types` outputs strongly-typed schemas in `frontend/types/nodepress.d.ts`.
- Next.js Draft Mode: `/api/draft` and `/api/disable-draft` handlers allow real-time live preview of drafts with HMAC-signed tokens.
- **Content languages** (`locales/`): `Setting.locales` + `defaultLocale`, served by `GET /api/locales` (cached 60 s; `PUT` clears it). Frontend code reads them through `lib/locales.ts` (`useLocales()`, `loadLocales()`, `localeLabel()`) — never hard-code a language list. Entries are linked as translations by `contentTypeId + slug`; the admin entries list returns `translations: string[]` per row. Public single reads take `?fallback=true` and set `Content-Language`; lists take it too and add default-locale entries with no visible translation. That uses `entry_slugs` (one row per content type + slug, filled by a Postgres trigger — never write it) through the `Entry.slugGroup` relation, so Prisma emits a subquery instead of a slug list.
- **Slugs and locales** go through `common/slug-locale.util.ts` (`assertValidSlug`, `canonicalLocale`) on every create path; on update only a changed slug is checked so legacy entries stay editable.
- **Typed GraphQL**: `graphql/content-schema.ts` builds the per-content-type types/queries onto the code-first schema; `ContentGraphqlService` passes `captureBase` as `transformSchema` and itself as Apollo's `gateway` so it can swap schemas at runtime (rebuild on any ContentType write via the operation hook, plus a fingerprint poll for other instances). Resolvers go through `DynamicApiService` (resolved lazily with `ModuleRef` — never import `DynamicApiModule` elsewhere, its wildcard routes must register last). Relation fields batch per request (`batch()` keyed by the Apollo context object).
- **Admin interface languages** (`use-intl`, not next-intl): `components/AdminIntlProvider.tsx` + `lib/i18n/`; messages in `messages/<locale>/<namespace>.json` collected by `messages/<locale>/index.ts`. Server render is English; the browser switches to the saved choice. Use `const t = useTranslations('ns')` with **one variable name per namespace in a file** (the checker matches `t(...)` calls to the namespace by variable name), ICU plurals for counts, `t.rich` for markup, and add every key to all four languages — `node scripts/check-i18n.js` fails otherwise. Data (field labels, content type names, API errors) is never translated.
- **Public write API** (`POST/PUT /api/:type`) validates `data` with `DataValidator` (partial on update) and takes `status: draft|published` on create.
- **`client/`** is `@nodepress/client` — not a workspace, zero dependencies, built with the repo's TypeScript (`npm test` in `client/` builds CJS + ESM, type-tests `test/types-check.ts`, runs `node --test`). Keep its query-string serializer in step with `common/query-parser.ts`; `test/client.e2e-spec.ts` runs it against the real API. Its version is checked with the other manifests.
- **CLI `mcp`** (`cli/src/mcp.js`): stdio MCP server over the public API; covered by `test/mcp.e2e-spec.ts` (spawns the CLI).
- **Server settings**: `SMTP_HOST` set → email from env (read-only in the UI); otherwise `MailService` loads `Setting.mail` and `configure()` swaps the transporter live. Storage is chosen once at boot in `media.module.ts` (`STORAGE_DRIVER` env, else `Setting.storage`, else local) — a change needs a restart (`activeStorageDriver()` reports what's running).
- **Rich-text editor** (`components/RichTextEditor.tsx`, TipTap 3): Link/Underline are configured through `StarterKit.configure({ link, underline })` — adding the extensions separately creates duplicates. Keep `trailingNode: false` (it would append an empty `<p></p>` to every saved body), `shouldRerenderOnTransaction: true` (the toolbar reads `isActive()` during render), `onMouseDown={e => e.preventDefault()}` on toolbar buttons, and `{ emitUpdate: false }` on programmatic `setContent`.
- **Next.js 15**: route `params`/`searchParams` in server components are Promises (`const params = await props.params`), as are `cookies()`, `headers()` and `draftMode()`. `next/image` is unused and `images.unoptimized` keeps the `/_next/image` optimizer off.

### Auth system

- **JWT access tokens** via `@nestjs/passport` + `passport-jwt`. Token sent as `Authorization: Bearer <token>`, lifetime `JWT_EXPIRES_IN` (default 7d).
- **Refresh tokens**: login also sets an HttpOnly cookie `np_refresh` (30 days, `RefreshToken` model). `POST /api/auth/refresh` exchanges it for a new access token and **rotates** the refresh token (old one deleted); `POST /api/auth/logout` invalidates and clears it.
- **API Keys** via `X-API-Key` header. Two guards:
  - `ApiKeyGuard` — API key only (used on `api-keys` management routes? No — those use JWT)
  - `JwtOrApiKeyGuard` — accepts either JWT or a write/all API key. Used on dynamic-api write routes.
- **Per-key rate limiting** via `ApiKeyRateLimitInterceptor` (global): read=120 req/min, write=60 req/min, all=120 req/min. Returns `X-RateLimit-Limit/Remaining/Reset` headers. JWT requests are exempt.
- **Setup flow**: `POST /api/auth/register` only works when zero users exist. After setup, it returns 409. Frontend `/setup` page checks `GET /api/auth/setup-status` on load.
- **Team onboarding is invite-only**: `POST /api/users` (admin) takes **email + role, no password** — it creates the account with a random unusable password and emails a "Set your password" link (`UsersService.create` → `issueInviteToken`, 7-day token reusing `PasswordResetToken`). The user sets their own password at `/reset-password`. `POST /api/users/:id/invite` resends. When SMTP is not configured, both endpoints return `inviteUrl` in the response so the admin can deliver the link manually (the admin UI copies it to the clipboard).
- **Single sign-on** (`auth/oidc.service.ts`, `oidc.controller.ts`): OIDC code flow + PKCE; state/nonce/verifier ride in the signed HttpOnly `np_oidc` cookie (path `/api/auth/oidc`). The default redirect URI is `<SITE_URL>/api/auth/oidc/callback` — through the admin's own `/api` proxy, so the cookie comes back on the same host. The callback redirects to `/sso-callback#code=…` (one-time code in the fragment, 60 s, single use via `AppCacheService`), which `POST /auth/oidc/exchange` swaps for `AuthService.createSession()`. Verify ID tokens with `jwt.verifyAsync(token, { secret: keyObject, algorithms: [asymmetric only] })` — `@nestjs/jwt` ignores a per-call `publicKey` when the module has a `secret`.
- Login page redirects to `/setup` if `{ required: true }`.

### Frontend routing (Next.js App Router)

Four route groups:
- `(auth)` — `/login`, `/setup` — no layout wrapper
- `(admin)` — protected by middleware + sidebar layout: `/` (dashboard), `/content-types`, `/entries`, `/media`, `/api-keys`, `/forms` (+ `/[id]/submissions`), `/webhooks` (+ `/deliveries`), `/jobs`, `/plugins`, `/users` (+ `/permissions`), `/audit-log`, `/brand` (admin-only)
- `(docs)` — `/docs` — the in-app documentation page
- `(public)` — `/[type]`, `/[type]/[slug]` — server components, fetch from `BACKEND_URL` directly

**Middleware** (`middleware.ts`) protects the `ADMIN_PATHS` list (keep it in sync when adding an admin page). `ADMIN_ONLY_PATHS` (e.g. `/users`, `/api-keys`, `/webhooks`, `/audit-log`, `/content-types/new`) further restrict to admin role. Public routes and `/setup` pass through freely; already-logged-in users are redirected away from `/login` and `/setup`.

**API proxy**: `next.config.js` rewrites `/api/*`, `/uploads/*` and `/graphql` → `BACKEND_URL`. This only works client-side. Server components must use `BACKEND_URL` env var directly. Socket.io (`lib/useRealtimeEvents.ts`, `lib/useEntryPresence.ts`, both via `lib/realtime-socket.ts`) bypasses the proxy and connects to `${NEXT_PUBLIC_API_URL}/realtime` (falling back to the page origin). The `/realtime` namespace must be in the URL — the bare URL joins `/`, which connects but receives nothing.

**Changing the backend PORT** needs no other edits in local dev, via three cooperating pieces:
- `next.config.js` `resolveBackendUrl()` — when `BACKEND_URL` is unset or points at localhost, it reads `PORT` from `../backend/.env` (so a stale `.env.local` loses). For a local backend only, it inlines `BACKEND_URL` / `NEXT_PUBLIC_BACKEND_URL` / `NEXT_PUBLIC_API_URL` into the build. A remote URL is never inlined, because it may be a Docker-internal hostname.
- `config/env.ts` — outside production, an unset or localhost `APP_URL` is rewritten to `http://localhost:${PORT}` (media URLs follow).
- `main.ts` CORS — outside production, any `localhost`/`127.0.0.1` origin is allowed. In production only `CORS_ORIGIN` entries are allowed (`*` sends a literal wildcard). Disallowed origins get no CORS headers, not an error. The Socket.io gateway (`realtime.gateway.ts`) shares the same rules via `common/cors-origin.ts`.

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

Slug auto-generation: watches the first `text`/`textarea` field. Stops auto-generating once the user manually edits the slug field (`slugManualRef`). The slug is editable when editing an existing entry (with a warning that changing it breaks existing links/SEO); the backend (`PUT /entries/:id`) accepts a new slug and validates uniqueness per content type + locale.

### Media uploads & storage

Multer saves the incoming file to `backend/uploads/` first. Allowed types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`, `video/mp4`. Max 10MB. Filenames: `{timestamp}-{8-random-hex}{ext}`. Optimizable images are run through Sharp (resize + a **WebP sibling**), then a `Media` row records the URLs/dimensions.

**Pluggable storage** (`media/adapters/`, selected in `media.module.ts` by `STORAGE_DRIVER`):
- `local` (default) — bytes stay on disk in `backend/uploads/`; URL is `${APP_URL}/uploads/<file>` served by the backend.
- `s3` — `S3StorageAdapter` streams to any S3-compatible endpoint (AWS, Cloudflare R2, DigitalOcean Spaces, MinIO, B2), deletes the local temp file, and returns the bucket/CDN URL. The constructor **throws at boot** if `STORAGE_S3_BUCKET`/`ACCESS_KEY`/`SECRET_KEY` are missing — no silent fallback. R2/MinIO need `STORAGE_S3_ENDPOINT`; `STORAGE_S3_PUBLIC_URL` overrides the public base. Note R2 ignores the `public-read` ACL the adapter sets — its bucket must be made public separately.

**Production note**: `local` disk is ephemeral on PaaS (App Platform, containers without a volume) — a redeploy wipes `uploads/` while `Media` rows survive, breaking every image. Use `s3` or a persistent volume in production. (The Postgres DB is unaffected — it's an external managed service, not on the app filesystem.)

**On-the-fly transforms** (`media/image-transform.service.ts` + pure helpers in `image-transform.ts`): `GET /api/media/:file/transform` snaps `w`/`h` to `SIZE_BUCKETS` and `q` to steps of 10 so variants per image stay bounded — never accept raw sizes into the cache key. Encodes go through a concurrency gate (`IMAGE_TRANSFORM_CONCURRENCY`, 503 past 50 waiting); variants live in `uploads/.cache/variants` (S3 originals in `.cache/sources`), touched on hit and pruned nightly. `Media.focalX/focalY` drive `fit=cover` crops; the `fp=` query param only pins the URL for caching.

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

- **Selects** (`components/ui/select.tsx`): the `Select` wrapper builds Base UI's `items` map from the `<SelectItem>` children it renders, so `<SelectValue />` shows labels. Items rendered inside another component aren't visible to it — pass `items` explicitly there. Don't draw your own label next to `<SelectValue />`; it already renders the item's content.
- **Content type names** are always stored lowercased and snake_cased. The dynamic API normalizes `typeName.toLowerCase()` so `/api/Blog` resolves to content type `blog`.
- **Prisma `^6.19`** — not v7+. The v7 datasource `url` field syntax breaks this project. Prisma 6 removed `$use`: `PrismaService`'s constructor returns a `$extends` client whose query extension runs the hooks added with `onOperation()` (the extended client's prototype chain reaches the service, so its methods work, but `instanceof PrismaService` is false). `Bytes` fields are `Uint8Array`, not `Buffer` — wrap reads in `Buffer.from()`.
- **`@IsOptional()` on DTO optional fields** — required because `ValidationPipe` runs with `forbidNonWhitelisted: true`. Any field without a decorator causes a 400 error.
- **`DynamicApiModule` imports both `ApiKeysModule` and `AuthModule`** — needed because `JwtOrApiKeyGuard` (provided in `ApiKeysModule`) depends on `JwtService` which comes from `AuthModule`'s exported `JwtModule`.
- **Frontend `tsconfig.json` excludes `src/` and `vite.config.ts`** — leftover Vite files that must not be compiled by Next.js.
- **Brand** (name, logo, accent color) is a server-side singleton (`Setting` model, `GET/PUT /api/brand`), edited at `Settings → Brand` (`/brand`, admin-only) and shared app-wide via `BrandProvider` (`context/BrandContext.tsx`) — it drives the admin sidebar, browser title/favicon, login/setup pages, the accent color (`--brand` CSS var), and form-submission emails. The site name entered at setup seeds the brand (a PUT after first registration). (Legacy `np_site_name` localStorage was removed.)
- **Theme overrides**: the `Setting` model also holds optional `buttonColor`/`inputColor` (nullable hex). `BrandProvider` converts hex → HSL triplet (`lib/color.ts`, since shadcn tokens are stored as `H S% L%`) and injects `--primary`/`--primary-foreground` (button, with auto-contrast text) and `--input`/`--ring` (input border + focus ring) onto `documentElement` at runtime; `null` removes the override so the built-in theme default applies. Edited in the **Theme** card on `/brand`.
