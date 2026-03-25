# NodePress Backend

NestJS + PostgreSQL + Prisma REST API for the NodePress headless CMS.

> **New to NodePress?** Use the CLI instead: `npx create-nodepress-app my-project`
> Full setup guide: [buildwithkode.github.io/nodepress](https://buildwithkode.github.io/nodepress/)

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

Open `.env` and fill in the three required fields:

```env
# Use the password you set when installing PostgreSQL
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress"

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=paste_a_64_char_random_string_here

# The URL of your frontend/admin panel
CORS_ORIGIN=http://localhost:5173
```

> **Didn't set a PostgreSQL password?** Try: `postgresql://postgres@localhost:5432/nodepress`

---

## Install & Run

```bash
npm install

# Create database tables (run once)
npx prisma migrate dev

# Start development server
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger docs: `http://localhost:3000/api/docs`
- Health check: `http://localhost:3000/api/health`

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
| `REDIS_URL` | Enables shared Redis cache (in-memory by default) |
| `STORAGE_DRIVER` | `local` (default) or `s3` |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | For password reset emails |
