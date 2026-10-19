# Upgrading NodePress

How to move an existing install to a newer NodePress version. Read the notes
for every version between yours and the target before you start.

> Developers changing NodePress itself: see [UPGRADE_STRATEGY.md](UPGRADE_STRATEGY.md)
> for the backward-compatibility rules new code must follow.

## Every upgrade

### Local / VPS install

```bash
npm run backup                 # 1. database + uploads → backups/nodepress-<time>.tar.gz
git pull                       # 2. new code (or download the release)
npm install                    # 3. dependencies (also regenerates the Prisma client)
cd backend && npx prisma migrate deploy && cd ..   # 4. database migrations
npm run build                  # 5. backend + frontend
# 6. restart your process manager (pm2 / systemd / …)
```

### Docker

```bash
npm run backup                 # or rely on the nightly backup container
git pull
docker compose build
docker compose up -d           # the backend applies migrations on start
```

### If something goes wrong

Stop the app, check out the previous version, and restore the backup taken in
step 1:

```bash
git checkout <previous-tag>
npm install && npm run build
npm run restore -- backups/nodepress-<time>.tar.gz --force
```

`--force` is needed because the target database already has users. Restore runs
in one transaction, so a failed restore leaves the database as it was.

### Rules NodePress follows

- Migrations are additive within a major version: no column is dropped or
  renamed without a deprecation window.
- New environment variables always have safe defaults, so an old `.env` keeps
  working. Optional new settings are listed below.
- Anything that needs action from you is listed under **Action required**.

---

## Unreleased (next release)

**Action required**

- **Run migrations.** New: `add_two_factor_and_installed_plugins`,
  `add_entry_search_vector`, `add_entry_list_index`, `add_jobs`. All use
  `IF NOT EXISTS`. A database created with `prisma db push` has no migration
  history: apply each new `migration.sql` with `psql -f` instead (see
  `backend/prisma/migrations/`).
- **Admin frontend is now on Next.js 15** (from 14), which fixes two critical
  remote-code-execution advisories and many high ones. No configuration change
  is needed; custom pages that read route `params` in server components must
  `await` them (`const { slug } = await props.params`).
- **Docker:** rebuild both images (`docker compose build`). The previous images
  could not be rebuilt at all (out-of-sync lockfiles) and shipped vulnerable
  dependencies.

**New optional settings** (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_REPLICA_URL` | — | Read replica for public API reads |
| `REPLICA_READ_AFTER_WRITE_MS` | `5000` | Read the primary this long after a write |
| `QUEUE_WORKER` | `true` | `false` stops background workers on this instance |
| `QUEUE_POLL_MS` | `1000` | How often idle workers check for work |
| `WEBHOOK_CONCURRENCY` | `10` | Webhook deliveries in flight per instance |
| `JOB_CONCURRENCY` | `5` | Background jobs (form actions) in flight per instance |
| `HEALTH_MAX_HEAP_MB` | 90 % of the heap limit | Memory threshold for `/api/health` |

**Behaviour changes**

- Webhooks and form email/webhook actions are delivered by background queues
  with retries instead of inline. Deliveries in progress during a restart are
  retried automatically.
- Public cache invalidation is per content type.
- Content type schema import is all-or-nothing, and its dry run lists
  field-level changes.
