# Changelog

All notable changes to NodePress are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
NodePress uses [Semantic Versioning](https://semver.org/):
- **MAJOR** — breaking DB or API changes (run `npx prisma migrate deploy` + read upgrade notes)
- **MINOR** — new features, fully backwards-compatible
- **PATCH** — bug fixes, no migration needed

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
