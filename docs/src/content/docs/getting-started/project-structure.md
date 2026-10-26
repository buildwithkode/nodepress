---
title: Project structure
description: What's in a NodePress project folder and where to make changes.
sidebar:
  order: 4
---

A project is an [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) monorepo with two apps, the API (`backend/`) and the admin panel (`frontend/`). One `npm install` at the root installs both.

```text
my-site/
├── backend/                 NestJS API server
│   ├── src/                 modules: content types, entries, media, auth, plugins…
│   ├── prisma/
│   │   ├── schema.prisma    database schema
│   │   └── migrations/      SQL migrations, applied in order
│   ├── uploads/             uploaded media (local storage driver)
│   └── .env                 API settings and secrets (not committed)
├── frontend/                Next.js admin panel
│   ├── app/                 pages (App Router)
│   ├── components/          UI components
│   ├── messages/            admin translations, one folder per language
│   └── .env.local           admin settings (not committed)
├── client/                  source of the @nodepress-cms/client package
├── starters/                example sites (Next.js, Astro, Nuxt) that read from NodePress
├── nodepress.json           the NodePress release this project is on (used by upgrade)
└── package.json             workspace scripts: dev, build, migrate…
```

With `--docker` the project also has `docker-compose.yml`, `docker-compose.prod.yml`, `nginx/` and `monitoring/`.

## The two apps

| | API (`backend/`) | Admin (`frontend/`) |
|---|---|---|
| Runs on | port `3000` (`PORT` in `backend/.env`) | port `5173` |
| Serves | `/api/*`, `/graphql`, `/uploads/*` | the admin UI at `/` |
| Talks to | PostgreSQL, and Redis if configured | the API, through its own `/api` proxy |

In the browser, the admin calls its own `/api/...`, and Next.js forwards those calls to the backend. Your website calls the backend directly.

## Configuration

Settings live in environment files that `create-nodepress-app` generates and git ignores:

- **`backend/.env`** holds the database connection (`DATABASE_URL`, `DIRECT_URL`), `JWT_SECRET` (32 characters or more, or the API refuses to start), the public URLs (`APP_URL` for the API, `SITE_URL` and `CORS_ORIGIN` for the admin) and optional services: Redis, S3 storage, SMTP, Sentry, search.
- **`frontend/.env.local`** holds `BACKEND_URL`, where the admin finds the API.

`backend/.env.example` documents every variable. Invalid settings stop the API at startup with a message naming the variable.

## Where your changes go

Most sites never touch the code: content types, components, roles, webhooks, forms and settings all live in the database and are managed in the admin.

When you do change code, these are the usual places:

| You want to… | Change |
|---|---|
| Add server behaviour (hooks, routes, integrations) | a [plugin](https://github.com/buildwithkode/nodepress/tree/main/backend/src/plugins) in `backend/src/plugins/` |
| Change the admin UI | `frontend/app/` and `frontend/components/` |
| Change the database schema | `backend/prisma/schema.prisma`, then `npm run migrate` to create a migration |

Plugins are the least likely to conflict when you [upgrade](/getting-started/installation/#upgrading), because NodePress itself rarely changes those files.
