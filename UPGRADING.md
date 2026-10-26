# Upgrading NodePress

How to move an existing install to a newer NodePress version. Read the notes
for every version between yours and the target before you start.

> Developers changing NodePress itself: see [UPGRADE_STRATEGY.md](UPGRADE_STRATEGY.md)
> for the backward-compatibility rules new code must follow.

## Every upgrade

### Local / VPS install

```bash
npm run backup                 # 1. database + uploads → backups/nodepress-<time>.tar.gz
npx create-nodepress-app upgrade   # 2. new code — commit first; --dry-run to preview
npm install                    # 3. dependencies (also regenerates the Prisma client)
cd backend && npx prisma migrate deploy && cd ..   # 4. database migrations
npm run build                  # 5. backend + frontend
# 6. restart your process manager (pm2 / systemd / …)
```

A project made with `create-nodepress-app` has its own git history, so step 2
applies the release's changes to your code instead of pulling: your edits are
kept, and lines you and NodePress both changed get conflict markers to resolve.
Projects created before `nodepress.json` existed add `--from <version>` once.
A clone of the NodePress repository itself can still `git pull`. A scaffolded
project has no `npm run backup` script; use `pg_dump` and copy
`backend/uploads/` instead.

### Docker

```bash
npm run backup                 # or rely on the nightly backup container
npx create-nodepress-app upgrade   # or git pull in a clone of the repository
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

## npm 12

Nothing to do: NodePress installs and runs with npm 12's install-script
blocking (the root `package.json` lists which dependency scripts may run).
npm 12 itself needs Node.js `^22.22.2`, `^24.15.0` or `>=26` — upgrade Node
before npm. If you add a dependency with an install script, decide it with
`npx npm approve-scripts <pkg>` (or add `"<pkg>": true|false` to
`allowScripts`) — the pre-push check fails until you do. Keep the list in the
root `package.json`; npm ignores it in `backend/` and `frontend/`.

## 1.7.1 (from 1.7.0)

No migrations. **Behaviour changes** (security fixes):

- Anonymous `GET /api/content-types` (and GraphQL `contentTypes`) return only
  types open to the public API, without `readRoles` fields or `previewUrl`.
  A site that reads schemas without credentials sees only its public types.
- `GET /api/media` and `GET /api/content-types/:id/form` need a login.
- The forms admin API is for admins and editors only (submitting is unchanged).
- Anonymous GraphQL `entry(id)` / `entries` return published entries of public
  types only.
- `/api/draft?redirect=` accepts only paths on the same site.

Projects created before 1.7.1 have no `nodepress.json`: run
`npx create-nodepress-app upgrade --from <your version>` once.

## 1.7.0 (from 1.6.x)

**Action required**

- **Run migrations.** New: `add_two_factor_and_installed_plugins`,
  `add_entry_search_vector`, `add_entry_list_index`, `add_jobs`,
  `add_media_focal_point`, `add_content_locales`, `add_plugin_packages`,
  `add_entry_slugs`, `add_releases`, `add_server_settings`,
  `add_roles_components_redirects`, `add_choice_lists`. All use
  `IF NOT EXISTS`. A database created with `prisma db push` has no migration
  history: apply each new `migration.sql` with `psql -f` instead (see
  `backend/prisma/migrations/`).
- **Prisma 6** (from 5). `npm install` regenerates the client. Custom code or
  plugins that used `prisma.$use(...)` must switch to `prisma.onOperation(...)`
  (same `(params, next)` signature), and code reading `Bytes` columns gets a
  `Uint8Array` instead of a `Buffer`. Node.js 18.18 or newer is required.
- **The public write API validates entry data.** `POST`/`PUT /api/:type` now
  reject data that doesn't match the content type (422, same rules as the admin):
  wrong types, missing required fields on create, unknown select choices. Check
  scripts that write through API keys.
- **Public `?populate=` returns published linked entries only.** Previews that
  relied on drafts appearing there should use `?stage=draft` with credentials.
- **JWT writes through the public API need role permissions.** `POST`/`PUT`/
  `DELETE /api/:type` with a user's token now check that user's content
  permissions, and creating a published entry (the default) needs `publish`:
  scripts that sign in as a contributor must send `status: "draft"`. API keys
  are unaffected. `POST /api/entries` checks the entry's own content type.
- **Bulk actions and GraphQL entry mutations check content permissions.**
  A non-admin acting on entries of a content type its role can't change gets
  403 (`forbiddenContentTypes` in REST, an error in GraphQL) and nothing is
  changed — check the permissions matrix for roles used by scripts.
- **`?populate=` related entries changed shape slightly.** Their `data` no
  longer includes fields hidden by the related type's `readRoles`, and
  `contentType` holds only `{ id, name, displayName }` — code that read the
  related schema from there must fetch `/api/content-types` instead.
- **Slug changes create redirects.** Changing the slug of a published entry adds
  a 301 from the old path (see Redirects). Set `REDIRECTS_ON_SLUG_CHANGE=false`
  if your site handles this itself.
- **Plugins page fetches the plugin directory** from GitHub
  (`PLUGIN_REGISTRY_URL`). Set it to an empty value on servers without
  outbound internet access, or to your own registry file.
- **Prisma CLI is a runtime dependency** of the backend (for `migrate deploy` in
  Docker); rebuild the backend image.
- **Admin frontend is now on Next.js 15** (from 14), which fixes two critical
  remote-code-execution advisories and many high ones. No configuration change
  is needed; custom pages that read route `params` in server components must
  `await` them (`const { slug } = await props.params`).
- **Previewing staging/draft content now needs credentials.** `?stage=staging|draft|all`
  and the `X-NodePress-Environment: staging` header used to work anonymously,
  which exposed unpublished content to anyone. Preview frontends must now send
  an `X-API-Key` (any access level, covering the content type) or a JWT.
  Published reads are unchanged.
- **Entry slugs are validated on create.** New slugs (admin, public write API,
  import) must be lowercase letters, numbers and hyphens/underscores; API
  clients sending other slugs get a `400`. Existing entries are untouched.
- **Docker:** rebuild both images (`docker compose build`). The previous images
  could not be rebuilt at all (out-of-sync lockfiles) and shipped vulnerable
  dependencies.

**New optional settings** (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_REPLICA_URL` | — | Read replica for public API reads |
| `SEARCH_DRIVER` | `postgres` | `meilisearch` to answer `?search=` with Meilisearch (`MEILISEARCH_URL`, `MEILISEARCH_KEY`, `MEILISEARCH_INDEX`) |
| `ANTHROPIC_API_KEY` | — | Turns on the admin's AI assistant (`AI_MODEL`, default `claude-opus-5-5`) |
| `SETTINGS_SECRET` | `JWT_SECRET` | Key for secrets saved in Settings → Email & storage |
| `GRAPHQL_SCHEMA_POLL_MS` | `10000` | How often an instance checks for content type changes made elsewhere |
| `REPLICA_READ_AFTER_WRITE_MS` | `5000` | Read the primary this long after a write |
| `QUEUE_WORKER` | `true` | `false` stops background workers on this instance |
| `QUEUE_POLL_MS` | `1000` | How often idle workers check for work |
| `WEBHOOK_CONCURRENCY` | `10` | Webhook deliveries in flight per instance |
| `JOB_CONCURRENCY` | `5` | Background jobs (form actions) in flight per instance |
| `HEALTH_MAX_HEAP_MB` | 90 % of the heap limit | Memory threshold for `/api/health` |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_PROVIDER_NAME` | — | Single sign-on (see the Auth docs; more `OIDC_*` options in `.env.example`) |
| `IMAGE_TRANSFORM_CONCURRENCY` | `2` | Image encodes in flight per instance |
| `IMAGE_VARIANT_CACHE_MB` | `2048` | Size cap for cached image variants |
| `CDN_PURGE_DRIVER` | `none` | `cloudflare`, `fastly` or `webhook` — purge CDN cache on writes |
| `CDN_CACHE_TTL` | 3600 with a driver, 30 without | `s-maxage` for public API responses |
| `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_API_TOKEN` | — | For `CDN_PURGE_DRIVER=cloudflare` |
| `FASTLY_SERVICE_ID` / `FASTLY_API_TOKEN` | — | For `CDN_PURGE_DRIVER=fastly` |
| `CDN_PURGE_WEBHOOK_URL` / `CDN_PURGE_WEBHOOK_SECRET` | — | For `CDN_PURGE_DRIVER=webhook` |

**Behaviour changes**

- Webhooks and form email/webhook actions are delivered by background queues
  with retries instead of inline. Deliveries in progress during a restart are
  retried automatically.
- Public cache invalidation is per content type.
- Single-entry reads without `?locale=` use the default language from Settings → Languages (still `en` unless you change it).
- Image transform sizes are rounded up to fixed buckets (e.g. `w=500` returns 640 px wide) and quality to steps of 10.
- Content type schema import is all-or-nothing, and its dry run lists
  field-level changes.
