---
title: Create a project
description: Scaffold a new NodePress project with create-nodepress-app, its options, and every file it generates.
sidebar:
  order: 2
---

`npx create-nodepress-app <project-name>` creates a ready-to-run NodePress project from the latest release. This page lists what the command does and what it writes. For the full first-run walkthrough (database, migrations, admin account), see [Installation](/getting-started/installation/).

```bash
npx create-nodepress-app my-site
npx create-nodepress-app my-site --docker --sentry
```

## Requirements

Node.js 18 or newer and Git must be on your `PATH`. The command stops if Git is missing. Docker is only needed to run the stack a `--docker` project describes, and the command only warns if it can't find it.

## Options

| Option | What it does |
|---|---|
| `--docker` | Keeps the Docker setup: `docker-compose.yml`, `docker-compose.prod.yml`, `nginx/`, `monitoring/`, a root `.env` for Compose and the `docker:*` scripts. Without it, those files are removed. |
| `--sentry` | Keeps Sentry error tracking (`@sentry/nestjs`, `@sentry/profiling-node`, `@sentry/nextjs`, about 100 MB). Off by default. |
| `--no-install` | Skips `npm install`. Run it yourself before starting the project. |

Options can be combined and placed before or after the name.

The project name becomes the folder name. Characters other than letters, digits, `-` and `_` are replaced with `-`, and the name is lowercased, so `My Site` becomes `my-site`. The command stops if the folder already exists.

## What it does

1. Finds the newest release tag (`vX.Y.Z`, pre-releases ignored) and clones it. If the repository has no release tags, it clones `main` and warns that `upgrade` will need `--from` later.
2. Replaces the git history with a fresh repository and adds NodePress as a remote named `nodepress`, which `upgrade` fetches from.
3. Removes files that are only for developing NodePress: `.claude`, `CLAUDE.md`, `cli/`, `specs/`, `docs/`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `.githooks`, `.github`, `.vercelignore`, `backend/test`, the release checks in `scripts/`, the test scripts in `backend/scripts/` and the root `package-lock.json`. The backup, database-check and password-reset scripts stay.
4. Without `--docker`, removes `docker-compose.yml`, `docker-compose.prod.yml`, `nginx/`, `monitoring/` and the scripts they mount (`scripts/docker-secrets-init.sh`, `scripts/backup.sh`, `scripts/backup-crontab`).
5. Without `--sentry`, removes the Sentry config files and packages and replaces the admin's error reporter with a no-op, so the project builds without the SDK.
6. Writes `nodepress.json`, `backend/.env`, `frontend/.env.local`, a root `package.json` and, with `--docker`, a root `.env`.
7. Runs `npm install --no-audit --no-fund` in the project root. npm workspaces install the backend and the admin in one go.
8. Commits everything as `Create NodePress project (vX.Y.Z)`. The generated `.env` files and `node_modules` are git-ignored.

:::caution[First commit]
The commit fails if git has no `user.name` / `user.email`. The command warns and carries on. Commit the project yourself before your first [upgrade](/cli/upgrade/), which needs a clean working tree.
:::

## Generated files

### `backend/.env`

```bash title="backend/.env"
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE"
DIRECT_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/YOUR_NODEPRESS_DATABASE"
PORT="3000"
JWT_SECRET="<96 random hex characters>"
CORS_ORIGIN="http://localhost:5173"
APP_URL="http://localhost:3000"
SITE_URL="http://localhost:5173"
# SMTP_HOST=
SMTP_PORT="587"
SMTP_SECURE="false"
# SMTP_USER=
# SMTP_PASS=
# SMTP_FROM=
```

- Without `--docker`, the database URLs hold placeholders: replace `YOUR_PASSWORD` and `YOUR_NODEPRESS_DATABASE` with your PostgreSQL password and a database name.
- With `--docker`, they already point at the Compose database: `postgresql://postgres:<random password>@localhost:5432/nodepress`.
- With `--sentry`, a commented `# SENTRY_DSN=` line is added.

Every other setting has a default. See [Environment variables](/reference/environment-variables/).

### `frontend/.env.local`

```bash title="frontend/.env.local"
BACKEND_URL="http://localhost:3000"
```

With `--sentry`, a commented `# NEXT_PUBLIC_SENTRY_DSN=` line is added.

### `.env` (with `--docker` only)

The Compose files read this one. `DB_PASSWORD` and `JWT_SECRET` match the values in `backend/.env`.

```bash title=".env"
DB_PASSWORD="<random>"
JWT_SECRET="<same as backend/.env>"
CORS_ORIGIN="http://localhost"
APP_URL="http://localhost:3000"
SITE_URL="http://localhost"
```

See [Docker](/deployment/docker/) for running the stack.

### `package.json`

A root `package.json` with `backend` and `frontend` as npm workspaces and these scripts:

| Script | Runs |
|---|---|
| `postinstall` | `prisma generate` in `backend/` |
| `dev` | The backend and the admin together (with `concurrently`) |
| `dev:backend` / `dev:frontend` | One of them |
| `build` | Production build of the backend, then the admin |
| `migrate` | `prisma migrate dev` |
| `studio` | Prisma Studio |
| `install:all` | `npm install` |
| `docker:dev` / `docker:prod` / `docker:down` | `docker-compose up -d`, the production compose file with `--build`, `docker-compose down` (only with `--docker`) |

### `nodepress.json`

Records the release the project is on and the paths `upgrade` must leave alone. Commit it and don't edit it by hand.

```json title="nodepress.json"
{
  "version": "1.7.0",
  "ref": "v1.7.0",
  "repository": "https://github.com/buildwithkode/nodepress.git",
  "skip": ["CLAUDE.md", "cli", "docs", "package.json", "…"]
}
```

`upgrade` updates `version` and `ref` after each run. See [Upgrade](/cli/upgrade/#what-is-left-alone).

## Next steps

Set the database URL, then create the tables and start the project:

```bash
cd my-site
npm run migrate
npm run dev
```

The admin opens at http://localhost:5173 and asks you to create the first account. [Installation](/getting-started/installation/) covers hosted databases and Docker in detail.
