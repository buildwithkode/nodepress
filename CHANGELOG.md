# Changelog

All notable changes to NodePress are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
NodePress uses [Semantic Versioning](https://semver.org/):
- **MAJOR** — breaking DB or API changes (run `npx prisma migrate deploy` + read upgrade notes)
- **MINOR** — new features, fully backwards-compatible
- **PATCH** — bug fixes, no migration needed

---

## [1.2.0] — 2026-04-18

### Added
- **Form spam protection** — 3-layer defence on every `POST /api/submit/:slug`:
  - Rate limiting (20 req/min per IP via `@nestjs/throttler`)
  - Honeypot field (`_honey`) — non-empty value silently drops submission; bots never notified
  - Captcha verification — set `CAPTCHA_PROVIDER` (turnstile | hcaptcha | recaptcha) + `CAPTCHA_SECRET_KEY` in env; enable per-form with `captchaEnabled: true`; passes `captchaToken` from the client widget to the server for verification; fails open in dev if no provider is configured
- **Nested populate (dot-notation)** — `?populate=author,author.company,author.company.address` resolves relation chains up to 3 levels deep with one batched DB query per depth level; shared `populate.util.ts` used by both REST and admin APIs; caching bypassed when `?populate` is present
- **Socket.io Redis adapter** — when `REDIS_URL` is set, `@socket.io/redis-adapter` is dynamically attached in `RealtimeGateway.afterInit()`; syncs rooms and events across all backend instances; fails open (falls back to in-memory adapter on error, logs a warning)
- **Configurable audit log retention** — `AUDIT_LOG_RETENTION_DAYS` env var (default 90); scheduler reads the env at runtime; documented in `.env.example` and self-hosting table
- **Bulk entry operations** — `POST /api/entries/bulk-publish`, `bulk-archive`, `bulk-pending-review`, `bulk-delete` — all accept `{ ids: number[] }`
- **Export / import entries** — `GET /api/entries/export?contentTypeId=X` returns a JSON array; `POST /api/entries/import` upserts by slug+locale, returns `{ created, updated, errors }`
- **Draft preview tokens** — `POST /api/entries/:id/preview-url` returns a 1-hour signed JWT; `GET /api/:type/:slug/preview?token=<token>` serves the entry regardless of publish status
- **`?fields=` projection on admin entries API** — `GET /api/entries/:id?populate=...` now supported; comma-separated field projection strips non-requested data keys from the response

### Fixed
- `graphql.module.ts` — `ValidationContext.getAncestors()` removed in graphql-js v16; rewrote depth-limit rule to use the visitor function's 5th `ancestors` parameter
- `forms.e2e-spec.ts` — submission tests updated to use `{ data: { ... } }` wrapper matching `SubmitFormDto` shape; assertions updated from `res.body.id` to `res.body.submissionId`
- `.env.example` fully synced: added `DIRECT_URL`, `JWT_EXPIRES_IN`, `SMTP_SECURE`, `CAPTCHA_PROVIDER`, `CAPTCHA_SECRET_KEY`, `AUDIT_LOG_RETENTION_DAYS`, `ROBOTS_DISALLOW`

### Migration required
```bash
npx prisma migrate deploy
```
Applies:
- `20260418124205_add_form_captcha_enabled` — adds `captchaEnabled Boolean @default(false)` to the `forms` table

---

## [1.1.0] — 2026-04-07

### Added
- **i18n / Multi-locale** — `locale` field on every entry; composite unique key `(contentTypeId, slug, locale)`; `?locale=` filter on all public and admin APIs
- **Content Relations** — `relation` field type storing publicId UUIDs; `?populate=field1,field2` to inline related entries on any endpoint
- **GraphQL API** — Apollo Server at `/api/graphql`; resolvers for entries, content types, media, webhooks; optional JWT guard for public/private queries; query depth limit (max 6)
- **Real-time WebSocket** — Socket.io gateway at `/api/realtime`; `global` room + per-content-type rooms (`ct:<name>`); events: `entry:created`, `entry:updated`, `entry:deleted`, `media:uploaded`, `media:deleted`
- **Granular Roles** — `contributor` and `viewer` roles added alongside `admin` and `editor`
- **Permission matrix** — `Permission` DB table with role + contentType + actions[]; admin UI at `/users/permissions`; `GET/PUT /api/permissions` endpoints
- **Schema versioning** — Content type schema snapshots saved before each update; `GET /api/content-types/:id/schema-history` endpoint
- **Prometheus alerting rules** — `monitoring/alerts.yml` with rules for high error rate, high latency, high memory, and backend-down
- **Frontend stale-while-revalidate cache** — `lib/useFetch.ts` hook; cached API responses reused on navigation; background revalidation after 30 s
- **`useRealtimeEvents` hook** — `lib/useRealtimeEvents.ts`; typed handlers for all 5 WebSocket event types; automatic room subscriptions

### Fixed
- `auth.service.ts` — removed 9 `(this.prisma as any)` casts for `refreshToken` and `passwordResetToken`; now fully typed
- `dynamic-api.service.ts` — `findOne` referenced undefined `query` variable (runtime bug); fixed with proper `query: PublicSingleQuery` parameter
- `dynamic-api.service.ts` — `create`/`update`/`remove` used stale `contentTypeId_slug` unique key; updated to `contentTypeId_slug_locale`
- `dynamic-api.service.ts` — empty full-text search results now use `{ in: [-1] }` sentinel to prevent returning all entries
- `forms.service.ts` — `as any` casts replaced with `Prisma.InputJsonValue` / `Prisma.FormUpdateInput`
- `entries.service.ts` — JSON field casts replaced with `Prisma.InputJsonValue`
- CI — E2E tests now run in GitHub Actions with real PostgreSQL + Redis services (previously only type-check ran)
- Rate limit 429 response now includes `Retry-After: 60` header

### Migration required
```bash
npx prisma migrate deploy
```
Applies:
- `20260407100000_add_permissions` — permissions table
- `20260407110000_add_i18n_locale` — locale column + updated unique index on entries
- `20260407120000_add_schema_versions` — content_type_schema_versions table

---

## [1.0.0] — 2026-04-01

### Added
- Visual content type builder with drag-and-drop field ordering
- Field types: text, textarea, richtext (TipTap), number, boolean, select, image, repeater, flexible
- Auto-generated REST API for every content type (`GET /api/:type`, `GET /api/:type/:slug`)
- Entry versioning — every save creates a restorable snapshot
- Soft delete with trash/restore/purge flow
- Scheduled publishing via `publishAt` field
- Media library with Sharp image optimisation and automatic WebP generation
- Local disk storage and S3/R2/MinIO storage drivers
- API keys with granular permissions (read / write / all, per content type)
- Per-key rate limiting (120 req/min read, 60 req/min write)
- JWT authentication with refresh token rotation (15 min access, 30 day refresh)
- Password reset via email
- Form builder with email and webhook actions
- Webhooks with HMAC-SHA256 signing and exponential-backoff retry (3 attempts)
- Audit log with 90-day retention
- User management (admin role)
- Prometheus metrics endpoint (`GET /api/metrics`)
- Sitemap and robots.txt generation (`SITE_URL` env var)
- Health check endpoint (`GET /api/health`)
- Plugin system for extending the backend
- Redis-backed cache (falls back to in-memory)
- Distributed cron safety via PostgreSQL advisory locks
- `create-nodepress-app` CLI for zero-config scaffolding
- Docker Compose setup for development and production (includes PgBouncer, Nginx, Prometheus, Grafana, automated backups)
- Interactive API docs page at `/docs`

---

## Upgrading

### From any version to a newer MINOR or PATCH

```bash
cd your-project
git pull
cd backend && npx prisma migrate deploy && npm install
cd ../frontend && npm install
```

Prisma applies only the new migrations — your existing data is safe.

### From a MAJOR version

Read the upgrade notes in the specific release before running migrations.
