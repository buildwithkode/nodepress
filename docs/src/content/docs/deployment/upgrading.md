---
title: Upgrading
description: Move a production NodePress install to a newer version, with Docker or without, and roll back if something goes wrong.
sidebar:
  order: 9
---

Upgrading a live site is the same few steps every time: back up, get the new code, install, migrate, build and restart. Before you start, read the notes for every version between yours and the target in [UPGRADING.md](https://github.com/buildwithkode/nodepress/blob/main/UPGRADING.md). Anything that needs action from you is listed there under **Action required**.

## What NodePress promises

- Within a major version, migrations only add: no column is dropped or renamed without a deprecation period.
- New environment variables always have safe defaults, so an existing `.env` keeps working.
- Changes you have to act on are listed in UPGRADING.md under **Action required**.

## Without Docker

### 1. Back up

Back up the database and uploads first. See [Backups](/deployment/backups/). In a clone of the NodePress repository:

```bash
npm run backup
```

In a project made with `create-nodepress-app`, which has no backup script, use [pg_dump](/deployment/backups/#with-pg_dump).

### 2. Get the new code

In a project made with `create-nodepress-app`, commit your work, then:

```bash
npx create-nodepress-app upgrade --dry-run    # see what would change
npx create-nodepress-app upgrade              # latest release
npx create-nodepress-app upgrade 1.9.0        # or a specific one
```

It applies the release's changes to your code instead of replacing it: your edits are kept, and lines that both you and NodePress changed get conflict markers to resolve. See [create-nodepress-app upgrade](/cli/upgrade/) for the details, including projects made before `nodepress.json` existed (`--from <version>`).

In a clone of the NodePress repository, pull or check out the release instead:

```bash
git fetch --tags && git checkout v1.9.0
```

### 3. Install, migrate, build

```bash
npm install                                   # also regenerates the Prisma client
cd backend && npx prisma migrate deploy && cd ..
npm run build
```

`migrate deploy` applies only the new migrations and never resets data.

### 4. Restart

Restart both programs with your process manager, for example `pm2 restart all` or `systemctl restart nodepress-api nodepress-admin`. Then open the admin and check that it loads and that content shows up.

## Docker

```bash
npm run backup                     # in a clone of the repository; or rely on the nightly backup
npx create-nodepress-app upgrade   # or git pull in a clone of the repository
docker compose build
docker compose up -d
```

That builds your own images, which a project with its own code needs. A clone of the repository with no code changes can run the [ready-made images](/deployment/docker/#ready-made-images) instead: check out the release, set `NODEPRESS_VERSION` in `.env` to it, then `docker compose pull && docker compose up -d`.

With `docker-compose.yml`, the backend applies migrations when it starts. With `docker-compose.prod.yml`, the `migrate` service applies them before any backend replica starts. Add `-f docker-compose.prod.yml` (and any override files you use) to both commands.

If you installed with the [one-line installer](/deployment/self-hosting/#one-line-installer), run it again in the same place: it fetches the newest release, pulls its images and restarts. The domain is remembered from the first run.

## Managed hosts

On Render and similar hosts, push the upgraded code to the branch the service deploys from. The backend's start command runs `prisma migrate deploy` before it starts, so migrations apply on deploy. Back up the database before you push.

## If something goes wrong

Stop the app, go back to the previous version, and restore the backup from step 1.

In a clone of the repository:

```bash
git checkout <previous-tag>
npm install && npm run build
npm run restore -- backups/nodepress-<time>.tar.gz --force
```

`--force` is needed because the database already has users. The restore runs in one transaction, so a failed restore leaves the database as it was.

In a scaffolded project, undo the upgrade commit (or, before you commit it, `git reset --hard && git clean -fd`), run `npm install && npm run build`, and restore your dump with [pg_restore](/deployment/backups/#with-pg_dump).

Going back to older code without restoring the database usually works too, because migrations within a major version only add. Restoring is the safe path when the new version already wrote data.

## Databases built with db push

A database created with `prisma db push` has no migration history, and `migrate deploy` can't tell which migrations it already has. Apply each new migration's `migration.sql` from `backend/prisma/migrations/` with `psql -f` instead. NodePress's migrations use `IF NOT EXISTS`, so running one twice is harmless.

## After upgrading

- Check the new optional settings in UPGRADING.md; you don't have to set them.
- With Meilisearch, [rebuild the index](/deployment/search/#build-the-index) if the release notes say so.
- With several backend instances, upgrade them all: every instance should run the same version.
