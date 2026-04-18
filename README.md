# NodePress — Headless CMS for Frontend Developers

> Set up a headless CMS for your client in 10 minutes.
> Self-hosted. Open source. No subscription required.

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/create-nodepress-app)](https://www.npmjs.com/package/create-nodepress-app)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Ko-fi](https://img.shields.io/badge/Support%20on-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/buildwithkode)

## Why NodePress?

You're a frontend developer. You build in React or Next.js.
Your client needs to update their own content.
You don't want to deal with WordPress.
You can't justify $300/mo for Contentful.
You tried Strapi and spent 4 hours on Docker.

NodePress is the answer.

---

## Before you start

Install these three things first. **Already have all three? Skip to [Quick Start](#quick-start-recommended).**

### 1. Node.js 18+

> **Already installed?** Run `node -v`. If it shows `v18` or higher, skip to step 2.

Download from [nodejs.org](https://nodejs.org) — install the **LTS** version.

### 2. Git

> **Already installed?** Run `git --version`. If it shows a version number, skip to step 3.

Download from [git-scm.com/downloads](https://git-scm.com/downloads) — use default options.

### 3. PostgreSQL 14+

> **Already installed?** Skip to [Quick Start](#quick-start-recommended). Just make sure you remember the password you set during installation.

Download from [postgresql.org/download](https://www.postgresql.org/download/).

> **Tip:** During PostgreSQL installation you'll be asked to set a password for the `postgres` user. Write it down — you'll need it in step 1 below.

---

## Quick Start (recommended)

```bash
npx create-nodepress-app my-project
```

The CLI scaffolds the project, generates secure secrets, and installs all dependencies automatically.

---

## Option A — With Docker (easiest, no PostgreSQL needed)

Docker manages the database for you — no password changes required.

```bash
cd my-project
docker-compose up -d             # starts PostgreSQL + Redis
cd backend
npx prisma migrate dev           # create DB tables
npm run start:dev                # backend on :3000

# In a new terminal
cd my-project/frontend
npm run dev                      # admin panel on :5173
```

---

## Option B — Local PostgreSQL

> **Important:** The CLI generates a random database password in `backend/.env` that won't match your local PostgreSQL. You must update it before running migrations.

### 1. Update your database password

Open `my-project/backend/.env` and replace the generated password with the one you set during PostgreSQL installation:

```env
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE"
```

> No password set? Try: `postgresql://postgres@localhost:5432/YOUR_NODEPRESS_DATABASE`

### 2. Run database migrations

```bash
cd my-project/backend
npx prisma migrate dev
```

### 3. Start the backend

```bash
npm run start:dev
```

### 4. Start the frontend (new terminal)

```bash
cd my-project/frontend
npm run dev
```

### 5. Create your admin account

Open `http://localhost:5173` — you'll see the NodePress setup screen. Enter your site name, email, and password. Done!

---

## Production (full Docker stack)

```bash
cd my-project
# 1. Edit nginx/default.conf — replace YOUR_DOMAIN with your actual domain
# 2. Set strong passwords in docker-compose.prod.yml
docker-compose -f docker-compose.prod.yml up -d --build
```

Includes: PostgreSQL + PgBouncer (connection pooling), Nginx reverse proxy, Prometheus + Grafana monitoring, and automated daily backups.

---

## Manual Setup (clone from GitHub)

```bash
git clone https://github.com/buildwithkode/nodepress.git
cd nodepress

# Backend
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, CORS_ORIGIN
npm install
npx prisma migrate dev
npm run start:dev

# Frontend (new terminal)
cd ../frontend
cp .env.local.example .env.local
npm install
npm run dev
```

---

## Upgrading an existing install

NodePress uses Prisma migrations — your data is safe. Just pull and migrate:

```bash
git pull
cd backend && npm install && npx prisma migrate deploy
cd ../frontend && npm install
```

See [CHANGELOG.md](./CHANGELOG.md) for what changed in each version.

---

## What you get

- Visual content type builder — no code required
- Auto-generated REST API + GraphQL API for every content type
- Multi-locale (i18n) content — per-entry locale field with locale filtering
- Content relations — link entries across content types with `?populate=author,author.company` (nested dot-notation, up to 3 levels)
- Real-time updates via WebSocket (Socket.io) — subscribe to entry/media events; scales across instances with Redis adapter
- Media uploads with automatic WebP image optimisation
- API keys with per-key rate limiting (read: 120/min, write: 60/min)
- Form builder with email and webhook actions; 3-layer spam protection — rate limiting, honeypot, and captcha (Cloudflare Turnstile / hCaptcha / reCAPTCHA)
- Webhooks with retry logic, HMAC signing, and exponential backoff
- Granular role-based permissions — admin, editor, contributor, viewer
- Per-content-type permission overrides via admin UI
- Audit log with configurable retention, and user management
- Scheduled content publishing (`publishAt`) and draft preview tokens
- Bulk publish, archive, and delete across multiple entries at once
- Export and import entries as JSON (for backup, migration, or seeding)
- Entry version history + content type schema change history
- Plugin system — extend NodePress with custom NestJS modules
- Prometheus metrics + Grafana dashboard + alerting rules
- Client-friendly admin panel
- 100% self-hosted — your data, your server

---

## vs The Alternatives

|                      | NodePress | Strapi   | Contentful |
|----------------------|-----------|----------|------------|
| Setup time           | 10 min    | 2–4 hrs  | 5 min      |
| Docker needed        | No        | Yes      | No         |
| Price                | Free      | Free     | $300/mo    |
| Self-hosted          | Yes       | Yes      | No         |
| REST API             | ✅        | ✅       | ✅         |
| GraphQL API          | ✅        | ✅       | ✅         |
| Real-time (WS)       | ✅        | ❌ paid  | ❌         |
| i18n                 | ✅        | ✅       | ✅         |
| Content relations    | ✅        | ✅       | ✅         |
| Webhooks + retry     | ✅        | ✅ basic | ✅         |
| Audit log            | ✅        | ❌ paid  | ✅         |
| Plugin system        | ✅        | ✅       | ❌         |
| Client-friendly UI   | Yes       | Mediocre | Yes        |

---

## Tech Stack

NestJS · PostgreSQL · Prisma · Next.js 14 · TypeScript · Socket.io · Apollo GraphQL · Redis · Prometheus

---

## Troubleshooting

**`npm install` fails with peer dependency error**
Make sure all `@nestjs/*` packages are on the same major version. Check `backend/package.json` — everything should be `^10.x.x`.

**`npx prisma migrate dev` fails with auth error**
The password in `DATABASE_URL` doesn't match your PostgreSQL password. Re-check `backend/.env` — the format is `postgresql://postgres:YOUR_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE`.

**Admin panel shows blank page or 401**
The frontend can't reach the backend. Make sure `npm run start:dev` is running in the `backend/` folder and check that `CORS_ORIGIN=http://localhost:5173` is set in `backend/.env`.

**Images not loading after deploy**
Set `APP_URL` in `backend/.env` to your backend's public URL (e.g. `https://api.yourdomain.com`). Without it, uploaded file URLs point to localhost.

**Sitemap shows localhost URLs**
Set `SITE_URL` in `backend/.env` to your frontend's public URL (e.g. `https://yourdomain.com`).

**Port 3000 or 5173 already in use**
Change `PORT=3001` in `backend/.env` and update `CORS_ORIGIN` and `BACKEND_URL` accordingly.

---

## Contributing

NodePress is open source and contributions are welcome!

- [Contributing guide](./CONTRIBUTING.md) — local setup, code style, PR checklist
- [Bug reports](https://github.com/buildwithkode/nodepress/issues/new?template=bug_report.md)
- [Feature requests](https://github.com/buildwithkode/nodepress/issues/new?template=feature_request.md)

---

## Links

- **Documentation:** [buildwithkode.github.io/nodepress](https://buildwithkode.github.io/nodepress/)
- **npm package:** [npmjs.com/package/create-nodepress-app](https://www.npmjs.com/package/create-nodepress-app)
- **GitHub:** [github.com/buildwithkode/nodepress](https://github.com/buildwithkode/nodepress)
- **Issues:** [github.com/buildwithkode/nodepress/issues](https://github.com/buildwithkode/nodepress/issues)
- **Changelog:** [CHANGELOG.md](./CHANGELOG.md)

---

## Cloud version _(coming soon)_

1-click deploy at [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com)
$45/mo per project — no Docker, no server management, backups included.

---

## License

Copyright (c) 2026-present Karthik Paulraj / BuildWithKode.

NodePress is open source software licensed under the **[MIT License](./LICENSE)**. You are free to use, modify, and distribute it.
