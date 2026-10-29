---
title: Backups
description: Back up and restore the NodePress database and uploads, with the backup script, the Docker backup service, or pg_dump.
sidebar:
  order: 8
---

A NodePress site is its PostgreSQL database plus its uploaded files. Content types, entries, versions, users, settings, API keys and uploaded plugins all live in the database; uploads live on disk or in an S3 bucket. Back up both, and keep a copy of your secrets.

## What to back up

| What | Where | Notes |
|---|---|---|
| Database | PostgreSQL | Everything except uploaded files. |
| Uploads | `backend/uploads/` (`nodepress-data/uploads/` for the [server zip](/deployment/deploy-zip/)), or your S3 bucket | Skip `uploads/.cache`: it only holds resized variants and temporary files. |
| `JWT_SECRET` (or `SETTINGS_SECRET`) | `backend/.env` (`nodepress-data/.env` for the server zip), or the `secrets_data` Docker volume | Email and storage passwords saved in the admin are encrypted with it. Restoring the database under a different secret makes them unreadable. |

Backups contain password hashes, API keys and webhook secrets. Store them somewhere private.

## The backup script

A clone of the NodePress repository has a backup and restore script:

```bash
npm run backup                          # → backups/nodepress-<timestamp>.tar.gz
npm run backup -- --out /mnt/backups    # choose the folder
```

The [server zip](/deployment/deploy-zip/) includes it too: run it in the app folder, and it reads `nodepress-data/.env` and writes to `nodepress-data/backups/`.

:::note[Scaffolded projects]
A project made with `create-nodepress-app` doesn't include the `scripts/` folder, so it has no `npm run backup` or `npm run restore`. Use [pg_dump](#with-pg_dump) instead.
:::

The archive holds:

| File | Content |
|---|---|
| `db.dump` | A `pg_dump` in custom format: schema and data, without owners or privileges. |
| `uploads/` | `backend/uploads/`, when storage is local. Files on S3 are not copied; back the bucket up with your provider's tools. |
| `manifest.json` | The NodePress version, the time, the applied migrations and what's included. |

The archive is created readable by you only (mode `0600`).

The script reads `DATABASE_URL` and `DIRECT_URL` from the environment if either is set there, otherwise from `backend/.env`, and connects with `DIRECT_URL` when it's set, because a transaction-mode pooler can't run `pg_dump`. It needs the PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) and `tar`. `UPLOADS_DIR` overrides the uploads folder.

Run it from cron for scheduled backups:

```text title="crontab"
0 2 * * * cd /srv/my-site && npm run backup -- --out /mnt/backups >> /var/log/nodepress-backup.log 2>&1
```

## Restore

```bash
npm run restore -- backups/nodepress-20261026-020000.tar.gz
```

Restore is guarded, so it can't overwrite data by accident:

- It shows the backup and the target database, and asks you to type the target database's name. `--yes` skips the question in scripts.
- It refuses a database that already has users, a backup from a newer NodePress version, and a backup with migrations the current code doesn't have. `--force` overrides all three.
- It restores the database in a single transaction: if anything fails, the database is left as it was.
- It copies the uploads back, then runs `prisma migrate deploy`, so a backup from an older version is brought up to date.

Restart the backend afterwards so its caches start fresh. If you use Meilisearch, [rebuild the index](/deployment/search/#build-the-index).

To restore into the live database, which already has users, stop the backend first and pass `--force`:

```bash
npm run restore -- backups/nodepress-20261026-020000.tar.gz --force
```

## With pg_dump

In a scaffolded project, or anywhere without the script, use the PostgreSQL tools directly. Use the direct connection (`DIRECT_URL`) and remove Prisma-only parameters such as `?pgbouncer=true&connection_limit=1`, which `pg_dump` rejects.

```bash
# Back up
pg_dump --format=custom --no-owner --no-privileges \
  --file nodepress.dump "postgresql://user:password@host:5432/nodepress"
tar -czf uploads.tar.gz --exclude=.cache -C backend uploads
```

```bash
# Restore (stop the backend first)
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction \
  --dbname "postgresql://user:password@host:5432/nodepress" nodepress.dump
tar -xzf uploads.tar.gz -C backend
cd backend && npx prisma migrate deploy
```

`--clean --if-exists` drops the existing tables before restoring them, so the restore replaces everything in that database.

## Docker

### The Docker backup service

The [production stack](/deployment/docker/#the-production-stack) runs a `backup` container that dumps the database every night at 2:00 UTC into the `backups` volume (`nodepress_<date>_<time>.sql.gz`, a plain SQL dump) and deletes dumps older than 30 days. It doesn't include uploads. Copy the volume off the server, or set `BACKUP_S3_BUCKET` and AWS credentials on the service to upload each dump; that needs the `aws` CLI, which the default `postgres:16-alpine` image doesn't include.

Restore one of these dumps with `psql`:

```bash
gunzip -c nodepress_20261026_020000.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T db psql -U postgres nodepress
```

The dump has no `DROP` statements, so restore it into an empty database.

### Manual backups

```bash
# Database
docker compose exec -T db pg_dump -U postgres --format=custom nodepress > nodepress.dump

# Uploads (find the volume's full name with: docker volume ls)
docker run --rm -v <project>_uploads_data:/data -v "$PWD":/backup alpine \
  tar -czf /backup/uploads.tar.gz -C /data .
```

The standard stack keeps its generated JWT secret and database password in the `secrets_data` volume. Back that up as well, or set `JWT_SECRET` and `DB_PASSWORD` in `.env` yourself and keep that file.

## Test your backups

A backup you've never restored is a guess. Restore one into a throwaway database now and then: create an empty database, point `DATABASE_URL` and `DIRECT_URL` at it, restore, start the backend and open the admin.
