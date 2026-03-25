# NodePress — Headless CMS for Frontend Developers

> Set up a headless CMS for your client in 10 minutes.
> No Docker. No $99/mo. Just Node.js.

## Why NodePress?

You're a frontend developer. You build in React or Next.js.
Your client needs to update their own content.
You don't want to deal with WordPress.
You can't justify $99/mo for Contentful.
You tried Strapi and spent 4 hours on Docker.

NodePress is the answer.

---

## Quick Start

```bash
npx create-nodepress-app my-project
```

One command. Clones the repo, generates secrets, installs dependencies — done in under 10 minutes.

> Requires Node.js 18+, Git, and PostgreSQL 14+ running locally.

---

## Manual Setup

### 1. Prerequisites

- [Node.js 18+](https://nodejs.org)
- [Git](https://git-scm.com)
- [PostgreSQL 14+](https://www.postgresql.org/download/) running on port `5432`

```bash
node -v        # v18 or higher
git --version
psql --version
```

### 2. Clone

```bash
git clone https://github.com/buildwithkode/nodepress.git
cd nodepress
```

### 3. Configure environment

**Backend:**

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your values:

```env
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress"
JWT_SECRET="paste-a-random-64-char-string-here"
CORS_ORIGIN="http://localhost:5173"
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> If your PostgreSQL has no password use: `postgresql://postgres@localhost:5432/nodepress`

**Frontend:**

```bash
cd ../frontend
cp .env.local.example .env.local
```

Default value works for local dev — no changes needed:

```env
BACKEND_URL=http://localhost:3000
```

### 4. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 5. Run database migrations

```bash
cd backend
npx prisma migrate dev
```

> Auth error? Double-check `DATABASE_URL` password in `backend/.env`.

### 6. Start the backend

```bash
cd backend
npm run start:dev
```

- API: `http://localhost:3000/api`
- API docs: `http://localhost:3000/api/docs`
- Health: `http://localhost:3000/api/health`

### 7. Start the frontend _(new terminal)_

```bash
cd frontend
npm run dev
```

Admin panel: `http://localhost:5173`

### 8. First login

Open `http://localhost:5173` — you'll be redirected to `/setup`.
Create your admin account (first-time only).

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

## Cloud version _(coming soon)_

1-click deploy at [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com)

## Documentation

Full docs at [buildwithkode.github.io/nodepress](https://buildwithkode.github.io/nodepress/)
$45/mo per project — no Docker, no server management, backups included.

---

## License

MIT
