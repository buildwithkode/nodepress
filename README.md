<div align="center">

<h1>⚡ NodePress</h1>

<p><strong>The self-hosted headless CMS that's actually easy to run.</strong><br/>
Open source · Free forever · Production ready in 10 minutes</p>

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/create-nodepress-app)](https://www.npmjs.com/package/create-nodepress-app)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/e2e%20tests-173%20passing-brightgreen)](#)
[![Ko-fi](https://img.shields.io/badge/Support%20on-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/buildwithkode)

**[nodepress.buildwithkode.com](https://nodepress.buildwithkode.com)**

</div>

---

## The problem with every other CMS

**WordPress** — You're maintaining PHP, plugins, and a theme engine for a simple blog.

**Contentful** — $300/mo for features your project will use maybe 20% of.

**Strapi** — Spent 4 hours fighting Docker, Node version conflicts, and a half-broken admin UI.

**Sanity** — Vendor lock-in, CDN pricing surprises, and a learning curve nobody warned you about.

**NodePress is different.** It's a headless CMS built specifically for frontend developers who need a backend for their clients — not a platform to build a career on.

---

## Get running in 60 seconds

```bash
npx create-nodepress-app my-project
```

That's it. The CLI scaffolds the project, generates cryptographically secure secrets, installs all dependencies, and tells you exactly what to do next.

Open `http://localhost:5173` → fill in a form → you have a working CMS with a REST API, GraphQL API, admin panel, and real-time WebSocket events.

---

## Everything you need. Nothing you don't.

### Content Management
| Feature | What it does |
|---|---|
| **Visual content type builder** | Define your schema in the UI — no code, no config files |
| **Auto-generated REST API** | Every content type instantly gets `GET`, `POST`, `PUT`, `DELETE` endpoints |
| **GraphQL API** | Apollo Server with full queries + mutations — entries, content types, webhooks, media |
| **Multi-locale (i18n)** | Per-entry locale field with `?locale=` filtering on all endpoints |
| **Content relations** | Link entries across types — `?populate=author,author.company` (3 levels deep) |
| **Draft / Publish workflow** | Save as draft, publish when ready, or schedule with `publishAt` |
| **Draft preview tokens** | Share a signed URL to preview unpublished content on your frontend |
| **Bulk operations** | Publish, archive, or delete hundreds of entries in one click |
| **Export / Import** | Download all entries as JSON, re-import to seed or migrate |
| **Version history** | Every entry save is versioned — restore any previous state in one click |
| **Schema versioning** | Content type changes are tracked — see exactly what changed and when |

### Developer Experience
| Feature | What it does |
|---|---|
| **Real-time WebSocket** | Socket.io gateway — subscribe to `entry:created`, `entry:updated`, `media:uploaded`, and more |
| **API keys** | Scoped keys with per-key rate limiting (read / write / all · per content type) |
| **Webhooks** | HTTP callbacks on any event — HMAC signed, with retry + exponential backoff |
| **Swagger UI** | Interactive API docs at `/api/docs` — test every endpoint in the browser |
| **GraphQL Playground** | Apollo Sandbox at `/graphql` — explore your full schema and run mutations interactively in any environment |
| **Plugin system** | Drop in custom NestJS modules — add routes, services, and nav items |
| **Audit log** | Every admin action is logged with user, IP, resource, and timestamp |

### Media
| Feature | What it does |
|---|---|
| **File uploads** | Images, PDFs, videos — up to 10MB per file |
| **Auto WebP optimisation** | Sharp converts images to WebP on upload — smaller files, faster sites |
| **Folder organisation** | Group media into folders in the admin panel |
| **S3 compatible** | Switch from local disk to any S3-compatible bucket with one env var |

### Security & Access Control
| Feature | What it does |
|---|---|
| **4 roles** | Admin · Editor · Contributor · Viewer — each with a distinct permission set |
| **Per-content-type overrides** | Give Editor full access to `blog` but read-only on `legal` |
| **JWT + refresh tokens** | 7-day access tokens, 30-day silent refresh (HttpOnly cookie) |
| **Helmet + CORS** | Security headers on every response, strict origin enforcement |
| **Rate limiting** | Per-IP throttling on all endpoints, stricter on auth routes |

### Forms
| Feature | What it does |
|---|---|
| **Form builder** | Create forms in the UI, get a hosted submission endpoint |
| **Email actions** | Send submission data to any email address |
| **Webhook actions** | Forward submissions to Zapier, Make, or your own endpoint |
| **3-layer spam protection** | Rate limiting + honeypot field + captcha (Turnstile / hCaptcha / reCAPTCHA) |

### Production Infrastructure
| Feature | What it does |
|---|---|
| **Docker Compose stack** | One command deploys the full stack — backend, frontend, Nginx, Redis, PgBouncer |
| **PgBouncer** | Connection pooling — handles traffic spikes without exhausting PostgreSQL |
| **Redis** | Query-result cache + Socket.io multi-instance sync |
| **Prometheus + Grafana** | Pre-built dashboard, alerting rules for high error rate, high latency, backend-down |
| **Automated daily backups** | pg_dump every night at 2am UTC, 30-day retention, optional S3 upload |
| **Graceful shutdown** | SIGTERM / SIGINT handled — no dropped requests on deploy |

---

## How NodePress compares

|  | **NodePress** | Strapi | Contentful | Sanity |
|---|:---:|:---:|:---:|:---:|
| **Price** | Free forever | Free / $499+/mo | $300+/mo | Free / $99+/mo |
| **Self-hosted** | ✅ | ✅ | ❌ | ❌ |
| **Setup time** | ~10 min | 2–4 hrs | 5 min | 30 min |
| **Docker required (dev)** | ❌ No | ✅ Yes | N/A | N/A |
| **REST API** | ✅ | ✅ | ✅ | ✅ |
| **GraphQL API** | ✅ | ✅ | ✅ | ✅ |
| **Real-time WebSocket** | ✅ Free | ❌ Paid | ❌ | ❌ |
| **Multi-locale (i18n)** | ✅ | ✅ Paid | ✅ | ✅ |
| **Content relations** | ✅ | ✅ | ✅ | ✅ |
| **Draft preview tokens** | ✅ | ✅ | ✅ | ✅ |
| **Webhooks + retry** | ✅ | ✅ Basic | ✅ | ✅ |
| **Form builder** | ✅ | ❌ | ❌ | ❌ |
| **Audit log** | ✅ | ❌ Paid | ✅ | ❌ |
| **Plugin system** | ✅ | ✅ | ❌ | ✅ |
| **Prometheus + Grafana** | ✅ Built-in | ❌ | ❌ | ❌ |
| **Automated backups** | ✅ Built-in | ❌ | ❌ | ❌ |
| **PgBouncer pooling** | ✅ Built-in | ❌ | N/A | N/A |
| **Export / Import** | ✅ | ✅ | ✅ | ✅ |
| **Version history** | ✅ | ✅ Paid | ✅ | ✅ |
| **TypeScript end-to-end** | ✅ | ✅ | N/A | ✅ |
| **E2E test coverage** | ✅ 173 tests | Partial | N/A | N/A |

---

## Before you start

You need three things. **Already have them? Jump to [Quick Start](#get-running-in-60-seconds).**

**1. Node.js 18+**
```bash
node -v   # must show v18 or higher
```
Download from [nodejs.org](https://nodejs.org) — install the LTS version.

**2. Git**
```bash
git --version   # any version is fine
```
Download from [git-scm.com](https://git-scm.com/downloads).

**3. PostgreSQL 14+** *(or use Docker — see Option A below)*
```bash
psql --version   # must show 14 or higher
```
Download from [postgresql.org](https://www.postgresql.org/download/).

---

## Installation

### Option A — Docker (easiest, no PostgreSQL needed)

Docker manages the database and Redis for you.

```bash
npx create-nodepress-app my-project
cd my-project
docker-compose up -d             # starts PostgreSQL + Redis
cd backend
npx prisma migrate dev           # creates all DB tables
npm run start:dev                # backend on :3000

# In a new terminal
cd my-project/frontend
npm run dev                      # admin panel on :5173
```

### Option B — Local PostgreSQL

```bash
npx create-nodepress-app my-project
cd my-project/backend
```

Open `backend/.env` and set your PostgreSQL credentials:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/nodepress"
```

Then:

```bash
npx prisma migrate dev    # creates all DB tables
npm run start:dev         # backend on :3000

# New terminal
cd ../frontend
npm run dev               # admin panel on :5173
```

### Option C — Clone from GitHub

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

### First-time setup

Open `http://localhost:5173` — you'll see the NodePress setup screen.

Enter your site name, email, and password. **Save these credentials** — password reset requires SMTP to be configured. If you lose access before setting up SMTP, run `npx prisma studio` in the `backend/` folder to reset directly.

---

## Going to production

### Step 1 — Get a server

Any Ubuntu 22.04 VPS works. Recommended providers:

| Provider | Spec | Price |
|---|---|---|
| [Hetzner](https://hetzner.com) | 2 vCPU · 4GB RAM | ~€6/mo |
| [DigitalOcean](https://digitalocean.com) | 2 vCPU · 2GB RAM | ~$12/mo |
| [Vultr](https://vultr.com) | 1 vCPU · 2GB RAM | ~$6/mo |

Minimum: **1 vCPU · 1GB RAM**. Recommended: **2 vCPU · 2GB RAM** for Grafana + Redis.

### Step 2 — Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### Step 3 — Clone and configure

```bash
git clone https://github.com/buildwithkode/nodepress.git
cd nodepress
```

Create your production environment file:

```env
# backend/.env

NODE_ENV=production

DATABASE_URL=postgresql://postgres:your_password@localhost:5432/YOUR_NODEPRESS_DATABASE
DIRECT_URL=postgresql://postgres:STRONG_PASSWORD@db:5432/nodepress
DB_PASSWORD=STRONG_PASSWORD

JWT_SECRET=<run: openssl rand -hex 32>
CORS_ORIGIN=https://yourdomain.com
APP_URL=https://yourdomain.com
SITE_URL=https://yourdomain.com

# SMTP — required for password reset (see providers below)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
SMTP_FROM=you@gmail.com

# Protect the metrics endpoint
METRICS_TOKEN=<run: openssl rand -hex 16>
```

### Step 4 — Edit nginx config

Open `nginx/default.conf` and replace `YOUR_DOMAIN` with your actual domain:

```nginx
server_name yourdomain.com www.yourdomain.com;
```

### Step 5 — Deploy

```bash
NODE_ENV=production docker-compose -f docker-compose.prod.yml up -d --build
```

This starts: PostgreSQL · PgBouncer · Redis · NestJS backend · Next.js frontend · Nginx · Prometheus · Grafana · daily backup job.

Migrations run automatically on first start.

### Step 6 — Enable HTTPS

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Then uncomment the HTTPS server block in `nginx/default.conf` and reload:

```bash
docker-compose -f docker-compose.prod.yml restart nginx
```

### Step 7 — Open your site

Visit `https://yourdomain.com` → complete the setup wizard → you're live.

---

## SMTP setup (required for password reset in production)

> **Development:** No SMTP needed — the reset link is shown directly in the browser UI.
> **Production:** Configure one of the providers below before going live.

**Gmail** — free, works with any Google account

1. Enable 2-Step Verification → [generate an App Password](https://myaccount.google.com/apppasswords)
2. Add to `backend/.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
SMTP_FROM=you@gmail.com
```

**Resend** — recommended for developers, 100 free emails/day

1. Create account at [resend.com](https://resend.com) → [get API key](https://resend.com/api-keys)
2. Add to `backend/.env`:
```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxx
SMTP_FROM=onboarding@resend.dev
```

**SendGrid** — 100 free emails/day

1. Create account at [sendgrid.com](https://sendgrid.com) → [get API key](https://app.sendgrid.com/settings/api_keys)
2. Add to `backend/.env`:
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxx
SMTP_FROM=you@yourdomain.com
```

---

## Pre-launch security checklist

Before going live, verify:

- [ ] `JWT_SECRET` is at least 32 random characters (`openssl rand -hex 32`)
- [ ] `NODE_ENV=production` is set
- [ ] `CORS_ORIGIN` matches your exact frontend domain — no trailing slash
- [ ] SMTP is configured — password reset will silently fail without it
- [ ] `METRICS_TOKEN` is set — otherwise `/api/metrics` is publicly readable
- [ ] HTTPS is enabled and the HTTP → HTTPS redirect is uncommented in nginx
- [ ] Firewall: only ports 80 and 443 exposed to the internet

---

## GraphQL API

The GraphQL endpoint is at `/graphql`. Apollo Sandbox (interactive playground) is available in all environments — click **GraphQL Playground** in the Developer sidebar.

### Getting a Bearer token

All write mutations and protected queries require a JWT Bearer token. Three ways to get one:

**Option A — Login API (curl):**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}'
# Response: { "access_token": "eyJhbGci..." }
```

**Option B — Browser cookie:** Log into the admin panel → open DevTools (`F12`) → Application → Cookies → copy the value of `np_token`. That is your Bearer token (valid 7 days).

**Option C — API key:** Create one in Admin → API Keys. Use `X-API-Key: np_yourkey` header instead of Bearer token (no expiry).

Use the token in any request:
```
Authorization: Bearer eyJhbGci...
```
In Apollo Sandbox: click **Headers** tab at the bottom → add `{ "Authorization": "Bearer eyJhbGci..." }`.

### Queries
```graphql
query { entries(contentTypeId: 1, status: "published") { total data { id slug data } } }
query { entry(id: 1) { id slug status data createdAt } }
query { contentTypes { id name schema } }
query { contentType(id: 1) { id name schema } }
query { mediaFiles(page: 1, limit: 20) { total data { id filename url mimetype } } }
query { webhooks { id name url events enabled } }          # admin only
query { webhookDeliveries(webhookId: 1) { id status attempts responseStatus } }
```

### Mutations — Entries
```graphql
mutation { createEntry(contentTypeId: 1, slug: "hello", locale: "en", status: "draft", data: "{\"title\":\"Hello\"}") { id slug } }
mutation { updateEntry(id: 1, status: "published", data: "{\"title\":\"Updated\"}") { id updatedAt } }
mutation { deleteEntry(id: 1) { message } }           # soft delete
mutation { restoreEntry(id: 1) { id slug } }
mutation { purgeEntry(id: 1) { message } }            # permanent, admin only
mutation { restoreEntryVersion(entryId: 1, versionId: 3) { id updatedAt } }
mutation { bulkPublishEntries(ids: [1,2,3]) { affected } }
mutation { bulkArchiveEntries(ids: [4,5]) { affected } }
mutation { bulkDeleteEntries(ids: [6,7]) { affected } }
mutation { bulkSetPendingReviewEntries(ids: [8,9]) { affected } }
```

### Mutations — Content Types (admin only)
```graphql
mutation { createContentType(name: "blog", schema: "[{\"name\":\"title\",\"type\":\"text\"}]") { id name } }
mutation { updateContentType(id: 1, schema: "[{\"name\":\"title\",\"type\":\"text\"},{\"name\":\"body\",\"type\":\"richtext\"}]") { id } }
mutation { deleteContentType(id: 1) { id name } }
```

### Mutations — Webhooks (admin only)
```graphql
mutation { createWebhook(name: "Deploy", url: "https://example.com/hook", events: ["entry.created"]) { id } }
mutation { toggleWebhook(id: 1, enabled: false) { id enabled } }
mutation { pingWebhook(id: 1) { message } }
mutation { deleteWebhook(id: 1) { message } }
```

Add `Authorization: Bearer YOUR_JWT_TOKEN` header for authenticated mutations. Public queries (entries, contentTypes) work without auth but return published entries only.

---

## Upgrading

NodePress uses Prisma migrations — your data is safe. Pull and migrate:

```bash
git pull
cd backend && npm install && npx prisma migrate deploy
cd ../frontend && npm install
# Restart your server
```

See [CHANGELOG.md](./CHANGELOG.md) for what changed in each version.

---

## Tech stack

| Layer | Technology |
|---|---|
| **Backend** | NestJS · TypeScript · Prisma ORM |
| **Database** | PostgreSQL 16 · PgBouncer |
| **Cache** | Redis (ioredis) |
| **Auth** | JWT · Passport · bcrypt |
| **API** | REST · Apollo GraphQL · Swagger |
| **Real-time** | Socket.io (Redis adapter for multi-instance) |
| **Media** | Multer · Sharp (WebP) · S3 compatible |
| **Frontend** | Next.js 14 App Router · TypeScript · Tailwind CSS |
| **Proxy** | Nginx (gzip · rate limiting · WebSocket · SSL) |
| **Monitoring** | Prometheus · Grafana · pino structured logging |
| **Testing** | Jest · Supertest · 173 e2e tests |

---

## Troubleshooting

**"Cannot connect to the server" on login**
The backend isn't running. In the `backend/` folder run `npm run start:dev`, then check `http://localhost:3000/api/health`.

**Login fails with correct credentials**
You may have hit the rate limit (10 attempts/min in production). Restart the backend to clear it. If the problem persists, check `http://localhost:3000/api/auth/setup-status` — if `required: true`, setup wasn't completed.

**"Your session expired" after signing in**
Normal behaviour after 30 days of inactivity (refresh token lifetime). Just sign in again — no data is lost.

**Forgot password — no email received**
In development: the reset link appears directly on the forgot-password page — no SMTP needed.
In production: configure `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `backend/.env` using one of the [providers above](#smtp-setup-required-for-password-reset-in-production).

**`npx prisma migrate dev` fails with auth error**
The password in `DATABASE_URL` doesn't match your PostgreSQL installation. Update `backend/.env`:
```env
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress"
```

**Admin panel shows blank page or 401**
The frontend can't reach the backend. Confirm `npm run start:dev` is running in `backend/` and that `CORS_ORIGIN=http://localhost:5173` is set in `backend/.env`.

**Images not loading after deploy**
Set `APP_URL` in `backend/.env` to your backend's public URL (e.g. `https://yourdomain.com`). Without it, uploaded file URLs point to localhost.

**Sitemap shows localhost URLs**
Set `SITE_URL` in `backend/.env` to your frontend's public URL (e.g. `https://yourdomain.com`).

**Port 3000 or 5173 already in use**
Change `PORT=3001` in `backend/.env` and update `CORS_ORIGIN` and `BACKEND_URL` accordingly.

**Real-time updates not working in production**
Ensure your nginx config includes the `/api/realtime` WebSocket location block (included by default in `nginx/proxy.conf`). Check that port 80/443 is open and nginx is running.

**GraphQL Playground shows a blank page**
Browser cached an old response with stale security headers. Open an **Incognito window** (works immediately) or press `Ctrl+Shift+Delete` → clear *Cached images and files* → refresh. This only happens once after a server restart where headers changed.

---

## Contributing

NodePress is open source and contributions are welcome.

- [Contributing guide](./CONTRIBUTING.md) — local setup, code style, PR checklist
- [Bug reports](https://github.com/buildwithkode/nodepress/issues/new?template=bug_report.md)
- [Feature requests](https://github.com/buildwithkode/nodepress/issues/new?template=feature_request.md)

---

## Links

- **Documentation:** `/docs` in your running admin panel, or [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com/)
- **npm package:** [npmjs.com/package/create-nodepress-app](https://www.npmjs.com/package/create-nodepress-app)
- **GitHub:** [github.com/buildwithkode/nodepress](https://github.com/buildwithkode/nodepress)
- **Issues:** [github.com/buildwithkode/nodepress/issues](https://github.com/buildwithkode/nodepress/issues)
- **Changelog:** [CHANGELOG.md](./CHANGELOG.md)
- **Support:** [ko-fi.com/buildwithkode](https://ko-fi.com/buildwithkode)

---

## Cloud version *(coming soon)*

1-click deploy at [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com) — $45/mo per project. No Docker, no server management, automated backups included.

---

## License

Copyright © 2026-present BuildWithKode.

NodePress is open source software licensed under the **[MIT License](./LICENSE)**. Free to use, modify, and distribute — forever.
