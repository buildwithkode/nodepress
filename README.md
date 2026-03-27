# NodePress — Headless CMS for Frontend Developers

> Set up a headless CMS for your client in 10 minutes.
> No Docker. No $99/mo. Just Node.js.

[![Ko-fi](https://img.shields.io/badge/Support%20on-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/buildwithkode)

## Why NodePress?

You're a frontend developer. You build in React or Next.js.
Your client needs to update their own content.
You don't want to deal with WordPress.
You can't justify $99/mo for Contentful.
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

> **Already installed?** Skip to [Quick Start](#quick-start-recommended). Just make sure you remember the password you set for the `postgres` user.

Download from [postgresql.org/download](https://www.postgresql.org/download/).

> **PostgreSQL tip:** During installation you'll be asked to set a password for the `postgres` user. Write it down — you'll need it below.

---

## Quick Start (recommended)

```bash
npx create-nodepress-app my-project
```

Then follow these steps:

### 1. Update the database password

Open `my-project/backend/.env` in any text editor and update `DATABASE_URL` with your PostgreSQL password:

```env
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress"
```

> Didn't set a password during PostgreSQL install? Try: `postgresql://postgres@localhost:5432/nodepress`

### 2. Create database tables

```bash
cd my-project/backend
npx prisma migrate dev
```

> Auth error? The password in `DATABASE_URL` doesn't match your PostgreSQL password. Check step 1.

### 3. Start the backend

```bash
npm run start:dev
```

### 4. Start the admin panel (new terminal)

```bash
cd my-project/frontend
npm run dev
```

### 5. Create your admin account

Open `http://localhost:5173` → you'll be taken to the setup page. Enter your site name, email, and password. Done!

---

## Manual Setup (clone from GitHub)

```bash
git clone https://github.com/buildwithkode/nodepress.git
cd nodepress/backend
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, CORS_ORIGIN
npm install
npx prisma migrate dev
npm run start:dev

# In a new terminal
cd ../frontend
cp .env.local.example .env.local
npm install
npm run dev
```

---

## What you get

- Visual content type builder — no code required
- Auto-generated REST API for every content type
- Media uploads with image optimization
- API keys with per-key rate limiting
- Forms with email and webhook actions
- Webhooks with retry logic
- Audit log and user management
- Scheduled content publishing
- Client-friendly admin panel
- 100% self-hosted — your data, your server

---

## vs The Alternatives

|                    | NodePress | Strapi   | Contentful |
|--------------------|-----------|----------|------------|
| Setup time         | 10 min    | 2-4 hrs  | 5 min      |
| Docker needed      | No        | Yes      | No         |
| Price              | Free      | Free     | $300/mo    |
| Self-hosted        | Yes       | Yes      | No         |
| Client-friendly UI | Yes       | Mediocre | Yes        |

---

## Tech Stack

NestJS · PostgreSQL · Prisma · Next.js 14 · TypeScript

---

## Links

- **Documentation:** [buildwithkode.github.io/nodepress](https://buildwithkode.github.io/nodepress/)
- **npm package:** [npmjs.com/package/create-nodepress-app](https://www.npmjs.com/package/create-nodepress-app)
- **GitHub:** [github.com/buildwithkode/nodepress](https://github.com/buildwithkode/nodepress)
- **Issues:** [github.com/buildwithkode/nodepress/issues](https://github.com/buildwithkode/nodepress/issues)

---

## Cloud version _(coming soon)_

1-click deploy at [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com)
$45/mo per project — no Docker, no server management, backups included.

---

## License

Copyright (c) 2026-present Karthik Paulraj / BuildWithKode. All Rights Reserved.

NodePress is **proprietary software**. Source code is available for self-hosted use only.
You may not copy, redistribute, sell, or claim this software as your own without written permission.

See the [LICENSE](./LICENSE) file for full terms.
