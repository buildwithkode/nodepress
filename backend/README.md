# NodePress Backend

NestJS + PostgreSQL + Prisma REST API for the NodePress headless CMS.

## Requirements

- Node.js 18+
- PostgreSQL 14+

## Setup

```bash
cp .env.example .env
```

Edit `.env` with your values — three required fields:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/nodepress"
JWT_SECRET="paste-a-random-64-char-string-here"
CORS_ORIGIN="http://localhost:5173"
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Install & run

```bash
npm install
npx prisma migrate dev     # create database tables
npm run start:dev          # dev server with hot reload on :3000
```

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

## API

- Base URL: `http://localhost:3000/api`
- Swagger docs: `http://localhost:3000/api/docs`
- Health check: `http://localhost:3000/api/health`

## Environment variables

See `.env.example` for all available variables with descriptions.

**Required:**
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — min 32 characters, used to sign auth tokens
- `CORS_ORIGIN` — allowed origin for the admin panel

**Optional:**
- `PORT` — defaults to `3000`
- `REDIS_URL` — enables shared Redis cache (in-memory by default)
- `STORAGE_DRIVER` — `local` (default) or `s3`
- `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` — for password reset emails
