# Changelog

All notable changes to NodePress are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
NodePress uses [Semantic Versioning](https://semver.org/):
- **MAJOR** — breaking DB or API changes (run `npx prisma migrate deploy` + read upgrade notes)
- **MINOR** — new features, fully backwards-compatible
- **PATCH** — bug fixes, no migration needed

---

## [Unreleased]

### Added
- **Typed GraphQL per content type.** Every content type gets its own GraphQL types and `blogPost(slug, locale, fallback)` / `blogPosts(where, search, sort, page, limit, cursor, locale, fallback)` queries — fields typed by field type, relations resolved to the related type (batched per response), repeaters/groups as objects, flexible fields as unions per layout. Lists support the same filters as REST plus **language fallback**. The schema is rebuilt when content types change, with no restart (other instances within `GRAPHQL_SCHEMA_POLL_MS`, default 10 s). The code-first `/graphql` operations are unchanged; query depth limit raised from 6 to 8.
- **Two-way relations.** A relation field with `options.mappedBy` is a read-only reverse field listing the entries whose relation points here (`?populate=`, REST and GraphQL; newest 100). Set it with **Reverse of** in the content type editor; the entry editor lists what links to an entry.
- **Filter by a related entry's fields:** `?where[author][slug][eq]=jane`, `where[author.name][eq]=…`, `where[tags][label][in]=…`.
- **`@nodepress/client`** (new `client/` package): a typed, dependency-free JS/TS client — `collection(type).list/get/all/create/update/delete`, `graphql()`, `locales()`, `submitForm()`, `imageUrl()` — typed by `generate:types`.
- **Content releases** (Content → Releases): publish, unpublish or archive many entries together in one transaction, now or on a schedule; add entries from the Entries list or the entry editor; conflicts with other pending releases are flagged. `/api/releases*`, `release.published` webhook. Migration `20261022090000_add_releases`.
- **Admin interface in English, French, German and Spanish** — a language switcher in the top bar and on the sign-in page (defaults to the browser language). Messages in `frontend/messages/<locale>/`, checked by `scripts/check-i18n.js` (pre-push).
- **Starter templates** (Content Types → Start from a template): blog, agency and docs content models with working relations and optional sample entries. `GET /api/templates`, `POST /api/templates/:id/apply`.
- **AI assistant (optional, `ANTHROPIC_API_KEY`)**: *Generate with AI* suggests a content type from a description; *Draft with AI* fills an entry's text, number and choice fields. Validated suggestions, never saved automatically. `AI_MODEL` defaults to `claude-opus-5-5`.
- **MCP server:** `npx create-nodepress-app mcp` lets AI assistants list content types, read and search entries, run GraphQL and create drafts (`NODEPRESS_URL`, `NODEPRESS_API_KEY`).
- **Meilisearch search adapter** (`SEARCH_DRIVER=meilisearch`, `MEILISEARCH_URL`, `MEILISEARCH_KEY`): typo-tolerant ranked `?search=`, kept in sync from every entry write via the job queue, with Postgres as the fallback; `POST /api/search/reindex`, `GET /api/search/status`, `docker-compose.search.yml`.
- **Email and storage from the admin:** optional setup wizard steps and **Settings → Email & storage** for SMTP and S3-compatible storage (AWS S3, R2, Spaces, MinIO, B2) with *Send test* / *Test connection*. Secrets are encrypted at rest (`SETTINGS_SECRET`, else `JWT_SECRET`); `SMTP_*` / `STORAGE_*` env vars still take precedence. Migration `20261022120000_add_server_settings`.
- **One-line installer with automatic HTTPS:** `scripts/install.sh` (clone, `.env`, start; re-run to update) and `docker-compose.https.yml` (Caddy + Let's Encrypt for `DOMAIN`). **Deploy to Render** blueprint (`render.yaml`).
- **Public write API accepts `status: "draft" | "published"`** on create (default published).
- **List fallback for translations.** `GET /api/{type}?locale=fr&fallback=true` returns the French entries plus the default-language entries that have no published French translation — one entry per slug, each with the `locale` that was served — with filters, search, sorting, page and cursor paging applied to the merged list. Backed by a new `entry_slugs` table (one row per content type + slug, kept by a database trigger) so the check is a SQL subquery that scales to any number of entries. Migration `20261021140000_add_entry_slugs`.
- **Upload plugins from the admin (Plugin SDK, phase B).** Plugins → **Upload plugin** takes a plugin `.zip`, reviews it without running its code — manifest, NodePress compatibility, permissions (with descriptions) and Ed25519 signature — and installs it disabled; **Restart now** exits the server so Docker/PM2/systemd start it with the plugin loaded. Updating (keeps on/off state and settings) and deleting (plugin must be disabled) work the same way. Packages are stored in Postgres (`plugin_packages`, migration `20261021120000_add_plugin_packages`), so every instance — fresh containers and PaaS redeploys included — unpacks and loads them at startup into `PLUGINS_DIR` (default `backend/.plugins`). Plugin code gets `@nodepress/plugin-sdk`, `@nestjs/*`, Prisma and `rxjs` from the running server. A package that fails to load is listed with the error; one that breaks startup is switched off automatically so the next start succeeds. `PLUGIN_UPLOADS=signed` (default) accepts only packages signed by `PLUGIN_TRUSTED_KEYS`, `unsigned` allows any valid package with a warning, `off` blocks uploads and deletes. API: `POST /api/plugins/packages` (`?dryRun=true` reviews), `DELETE /api/plugins/packages/:id`, `POST /api/plugins/restart`; `GET /api/plugins` reports `source`, `signature`, `loadError`, `pending` and `meta.restartRequired`.
- **`create-nodepress-app plugin keygen` / `plugin pack`** — create a signing key, and zip and sign a built plugin (its `nodepress-plugin.json` plus the files it lists) for upload. Still zero-dependency.
- **Plugin SDK, phase A: a scoped `PluginContext` for plugins.** A plugin module imports `PluginContextModule.forPlugin(manifest)` and injects `@InjectPluginContext() ctx`. `ctx.on()` / `ctx.addFilter()` register hooks under the plugin's own id (no more self-declared ids), `ctx.config()` / `ctx.onConfigChange()` see only that plugin's settings, and `ctx.jobs.register()` / `enqueue()` use the background queue with types namespaced as `<plugin-id>.<type>`. Subscribing to an event needs the matching manifest permission (`entries:write` for before-create/update/publish, `entries:delete` for before-delete, `entries:read` for after-events, `jobs:run` for jobs) or startup fails with a clear message. The bundled `word-count` and `seo-analyzer` plugins use it. Everything is exported from `plugin/plugin-sdk.ts`.
- **Plugins can reject writes.** Throwing `PluginVetoError` from a before-hook stops the write with HTTP 422 and the plugin's message; any other error is still logged and ignored.
- **Plugin compatibility.** A manifest can declare `nodepress: '<semver range>'`. A plugin that doesn't support the running version stays disabled, can't be enabled (400), and the Plugins page says why.
- **Hooks fire for every way an entry changes,** not just single admin edits: before-create/update in the public write API, bulk publish/delete/archive/review/stage, restore, restore-version, promote, translations, import and scheduled publishing. Payloads gain `id`, `locale` and `source` (`admin`, `api`, `bulk`, `import`, `restore`, `translation`, `scheduler`, `promote`).
- **Licence gate for production dependencies** (`scripts/check-licenses.js`, pre-push + CI). Fails on strong copyleft (GPL, AGPL, SSPL…), unknown or missing licences — reading a package's LICENSE file when `package.json` has no field — so nothing that would affect NodePress's MIT licence or the commercial EcommPress can ship unnoticed. An audit of all 424 production packages found none: everything is permissive or LGPL (`sharp`'s libvips binaries), with two reviewed exceptions (`@sentry/cli`, FSL-1.1-MIT, build-time only; `pause`, MIT per its README).
- **Configurable content languages (Settings → Languages).** Admins pick the enabled languages and the default (`GET/PUT /api/locales`, `GET /api/locales/usage`); the migration `20261019130000_add_content_locales` enables every locale existing entries already use. The editor, new-entry page, entries filter and "Add translation" menu follow the list instead of a hard-coded 8 (with names from `Intl.DisplayNames`), the entries list shows per-language translation chips (missing ones dashed), and the public API gains `?fallback=true` (serve the default language when a translation is missing) plus a `Content-Language` header. Requests without `?locale=` get the configured default.
- **Single sign-on with any OpenID Connect provider** (Google Workspace, Microsoft Entra ID, Okta, Auth0, Keycloak). Authorization-code flow with PKCE, `state` and `nonce`; ID tokens verified against the provider's JWKS (asymmetric algorithms only, issuer, audience, expiry), with a JWKS refresh when a key rotates. The session reaches the frontend as a one-time code in the URL fragment, swapped at `POST /api/auth/oidc/exchange` for the usual access token + refresh cookie. Invite-only by default (`OIDC_AUTO_CREATE`), optional email-domain allow-list, and role mapping from a groups claim (`OIDC_ROLE_CLAIM` / `OIDC_ROLE_MAP`). No new dependencies.
- **Image focal points and smarter transforms.** Set a focal point per image (crosshair in Admin → Media, or `PUT /api/media/:filename/focal-point`); `fit=cover` crops keep it in frame. `format=auto` serves AVIF/WebP/JPEG by the `Accept` header (with `Vary: Accept`). Transforms now work with S3 storage (the original is fetched once, max 25 MB). The media library shows 384 px variants instead of full-size originals. Migration `20261019120000_add_media_focal_point`.
- **CDN caching with purge on publish.** Public published reads send `Cache-Control: public, max-age=0, s-maxage=…` (browsers revalidate via ETag; the CDN holds the response) plus `Cache-Tag` / `Surrogate-Key` headers (`np-all`, `np-ct-<id>`). With `CDN_PURGE_DRIVER=cloudflare|fastly|webhook`, every write purges only the content types it changed — batched over 2 s and sent as a retried `cdn.purge` job — so `s-maxage` defaults to 3600 (30 without a driver; `CDN_CACHE_TTL` overrides). A purge of everything uses the `np-all` tag, never Cloudflare's purge-everything. Previously browsers cached for 30 s, so a publish could take that long to show.
- **Developer → Jobs admin page** (`/jobs`, admin only) and `GET /api/jobs`, `POST /api/jobs/:id/retry`, `POST /api/jobs/retry-failed`, `DELETE /api/jobs/:id`: see background jobs by status and type with counts, inspect the error and payload, retry one or all failed jobs (fresh attempts, worker woken immediately), and delete finished ones. Pending jobs can't be deleted because they may be running.
- **`npm run backup` / `npm run restore`.** One archive (mode 0600) with a `pg_dump` of the database, local uploads and a manifest (version, applied migrations). Uses `DIRECT_URL` when set (poolers can't dump) and strips Prisma-only URL parameters. Restore asks you to type the database name, refuses a database that has users, a newer-version backup or unknown migrations without `--force`, restores in one transaction, then runs `prisma migrate deploy`. See `UPGRADING.md` and the docs' Self-Hosting section.
- **Schema import dry run shows field-level changes** — added, removed, type-changed, newly required and modified fields per existing content type — in the API response and the admin import dialog.
- **`UPGRADING.md`** — the upgrade procedure (backup, pull, install, migrate, build, restart; rollback via restore) and per-release action items.
- **The pre-push hook now runs the audit and version checks too** — GitHub Actions has not executed a run on this account since **2026-03-25**, so the CI jobs above, while correct, are dormant; the local pre-push hook is the only automated gate that actually runs before code leaves a machine. It now also runs `npm audit --omit=dev --audit-level=high` and `scripts/check-versions.js` alongside the existing type-checks and unit tests. The runtime smoke test stays out of the hook because it needs a real PostgreSQL — run `./scripts/validate.sh --no-scaffold --smoke` before publishing.

- **CI now boots the app and gates on dependency and version hygiene** — three checks that no existing job performed. A **runtime smoke** job runs `scripts/validate.sh --no-scaffold --smoke`, which builds, boots the backend against a real PostgreSQL, and exercises register → content type → entry → public read, including the richtext sanitize path and the relation/cache regression. This closes the gap that let the NestJS 11 upgrade produce an app that died during bootstrap while `tsc` and all 245 unit tests stayed green — CI was fully green over an application that could not start. A **hygiene** job runs `npm audit --omit=dev --audit-level=high` (a critical `tar` RCE and 17 highs had sat in production dependencies for months) and a new `scripts/check-versions.js`, which fails when manifests disagree, when CHANGELOG.md lists a version twice, or when entries are out of order — the exact shape of the 1.3.0-twice numbering error. Coverage thresholds were also raised from 25–30% to the suite's actual 35/38/29/36, so coverage can only ratchet upward.

- **`npm run dev` now checks PostgreSQL is reachable before starting anything** — when the database was down the backend exited on startup, `concurrently` kept the frontend running, and every proxied request failed with a bare `AggregateError [ECONNREFUSED] ... port 3000`. That error names the frontend's port and never mentions Postgres, so the first thing you touch — usually the login form — looked broken instead. A new `predev` script (`scripts/check-db.js`, no dependencies) TCP-checks the host/port from `DATABASE_URL` (falling back to `backend/.env`, then `localhost:5432`) and, if nothing is listening, prints the platform-specific start command and aborts rather than leaving a half-running stack. Set `SKIP_DB_CHECK=1` to bypass. This complements the PrismaService startup check, which covers the case where Postgres *is* running but the schema is missing.

- **Captcha toggle in the Form Builder** — the per-form `captchaEnabled` flag (spam protection for public `POST /api/submit/:slug` submissions) was settable only via the API. It's now a **"Spam Protection (Captcha)"** switch in the admin form builder (new + edit), so it can be turned on without touching the API. Captcha verification itself (Cloudflare Turnstile / hCaptcha / reCAPTCHA) still requires `CAPTCHA_PROVIDER` in the backend env; honeypot + rate limiting remain always-on regardless of this switch.
- **Per-entry SEO on the create page** — the **SEO & Open Graph** accordion (SEO title, meta description, OG image URL, noindex) previously existed only on the entry *edit* page. It's now on the *create* page too, so SEO can be set while first authoring an entry instead of having to save and reopen it. The live JSON preview reflects the `seo` object as you type.
- **Public API now returns the `seo` object** — `GET /api/{type}/{slug}` (plus the list + preview reads) now include each entry's `seo`. Previously it was stored but never read back, so per-entry SEO overrides never reached the rendered page. The public read still strips internal fields (`status`, `deletedAt`).
- **Canonical + absolute metadata URLs on public pages** — entry detail pages now emit `<link rel="canonical">` and `og:url`, resolved to absolute URLs via a `metadataBase` derived from `SITE_URL` (which also makes relative `/uploads/…` OG images absolute). Set `SITE_URL` in the **frontend** env in production (documented in `frontend/.env.local.example`).

### Security
- **`sanitize-html` 2.18.1 and `follow-redirects` 1.16.1** — three rich-text sanitizer bypasses that could let `javascript:` URLs or `<noscript>` content through (moderate), and credential headers leaking across cross-origin redirects in axios (high). Lockfile-only for `follow-redirects`; all three lockfiles updated.
- **Disabling a plugin now switches off its HTTP routes.** Previously only its hooks stopped; its controllers kept serving. A global `PluginEnabledGuard` answers 404 for controllers declared in a disabled plugin's module, and a disabled plugin's queued jobs fail instead of running.
- **Plugin settings no longer leak secrets.** `GET /api/plugins` returned every plugin's full config, including `password`-type values such as payment keys, to editors. Settings are now sent to admins only, with password values masked; saving the form with the mask keeps the stored secret, and the audit log records changed keys instead of values.
- **Rich-text editor upgraded to TipTap 3 — the production audit is now completely clean (0 advisories of any severity, down from 29 moderate).** Link and Underline now come from StarterKit 3 (the separate packages are removed); Placeholder from `@tiptap/extensions`. StarterKit 3's TrailingNode is disabled so saved HTML doesn't gain an empty `<p></p>`, `shouldRerenderOnTransaction` keeps the toolbar state live, and `setContent` no longer emits updates when syncing.
- **The image transform endpoint could be used to fill the disk and pin the CPU.** `GET /api/media/:file/transform` is public and unthrottled, and every distinct `w`/`h` (1–3840), `q` (1–100), `format` and `fit` combination was encoded and cached forever. Sizes are now snapped to 24 buckets and quality to steps of 10, at most `IMAGE_TRANSFORM_CONCURRENCY` (2) encodes run at once with a 50-request queue (then 503), identical concurrent requests share one encode, input is capped at 100 MP, and a nightly job prunes variants unused for 30 days and the least recently used above `IMAGE_VARIANT_CACHE_MB` (2048).
- **Unpublished content was readable without logging in.** The public `GET /api/:type` and `GET /api/:type/:slug` accepted `?stage=draft`, `?stage=all`, `?stage=staging` and the `X-NodePress-Environment: staging` header from anyone, returning draft, pending-review and staging entries — and the HTTP cache interceptor marked those responses `public`, so a CDN could have served them to everyone. Any stage other than `published` now needs a JWT or an API key covering the content type (`StageAccessGuard`), and such responses are `Cache-Control: private, no-store`. **Headless frontends that preview staging content must now send an API key.**
- **Admin frontend upgraded to Next.js 15.5 (from 14.2) — fixes two critical unauthenticated remote-code-execution advisories** (Image Optimization API with AVIF files; Windows-hosted servers) and a dozen high ones (SSRF, request smuggling, denial of service). 14.2.35 is the last 14.x release and has no fix. Route `params` in the two public server pages are now awaited. The unused `/_next/image` optimizer is switched off (`images.unoptimized`). Remaining production advisories are moderate only (TipTap 2 → 3 pending).
- **The production audit now covers the frontend.** The pre-push hook and CI only audited `backend/`, which is how the Next.js criticals went unnoticed. Both now run `npm audit --omit=dev --audit-level=high` at the repo root (all workspaces). `axios` and `prosemirror-view` were bumped, and `postcss` inside Next is overridden to 8.5.
- **Docker images were unbuildable and would have shipped vulnerable dependencies.** The images install from `backend/package-lock.json` and `frontend/package-lock.json`, not the root lockfile. The backend one failed `npm ci` (an `rxjs` override conflicting with the pinned dependency) and still resolved the critical `proxy-addr` and high `sharp`, `multer` and `engine.io` versions; the frontend one was out of sync with `package.json`. Both are regenerated and clean, and the new `scripts/check-docker-lockfiles.sh` (pre-push + CI) checks they install and have no high/critical advisories (`--fix` regenerates them).
- **Security policy, Dependabot and CodeQL.** `SECURITY.md` (private reporting, response times, operator hardening checklist), `.github/dependabot.yml` (weekly grouped updates for the workspace and Docker lockfiles, base images and actions; Prisma majors ignored) and a CodeQL `security-extended` workflow.
- **Production `npm audit` is clean again (0 vulnerabilities).** Fixed the critical `proxy-addr` advisory (`npm audit fix`) and upgraded **nodemailer 9 → 10** (SMTP credential disclosure). The remaining highs came from `@nestjs/graphql` 13 (`@graphql-tools/utils` prototype pollution, and `ts-morph` → `fast-glob` → `braces`); `@nestjs/graphql` 14 requires NestJS 12, so instead `overrides` pin `@graphql-tools/utils` to the patched 12.0.4 and `ts-morph` to 27 (which drops `fast-glob`), plus `js-yaml` 5.5 under `@nestjs/swagger`. GraphQL e2e tests pass on the overridden versions.
- **`npm run test:e2e` refuses to run against a non-local database.** The suite deletes every table, and it read `DATABASE_URL` from `backend/.env` — which on a developer machine may be production. It now loads `backend/.env.test` first and aborts unless the database host is local (`E2E_ALLOW_REMOTE_DB=1` overrides).
- **Docker images moved from Node 20 (end-of-life since April 2026) to Node 22 LTS.**
- **`docker-compose.yml` no longer ships a hardcoded `JWT_SECRET` or database password.** Since `95e8ce3` the file defaulted `JWT_SECRET` to a fixed value committed to this public repo, so any install started without its own `.env` could have admin tokens forged by anyone. A new `secrets-init` service (`scripts/docker-secrets-init.sh`) now generates both secrets on first boot into a `secrets_data` volume; values set in `.env` still win. **Upgrading an existing Docker install**: the JWT secret is regenerated automatically (everyone is logged out once); the database keeps its old default password so the backend can still connect, and a warning asks you to rotate it. `CORS_ORIGIN` now defaults to `SITE_URL` instead of `*`, and `docker-compose.prod.yml` refuses to start without `DB_PASSWORD` / `JWT_SECRET`.
- **Backend dependency upgrade — production `npm audit` goes from 50 vulnerabilities (1 critical, 17 high) to 0.** No application code changed; only manifests and lockfiles. Upgraded **sharp 0.32.6 → 0.35.3** (libvips CVEs, reached on every image upload), **bcrypt 5 → 6** (drops `@mapbox/node-pre-gyp` → the critical `tar` arbitrary-file-write; existing `$2b$` hashes still verify, so no user re-login), **nodemailer 8 → 9** (SMTP command injection via unsanitized envelope), the **NestJS 10 → 11** family incl. `@nestjs/apollo`/`graphql` 12 → 13 (pulls in patched `multer`, `ws`, `path-to-regexp`), and **sanitize-html → 2.17.7** (two `allowedTags`/URI-scheme bypasses). Removed **`apollo-server-express@3`**, which was end-of-life and declared but never imported.

### Fixed
- **The public write API now validates `data` against the content type** (types, required fields, choices, read-only reverse fields) like the admin does; API-key writes could previously store anything. Updates are checked as partial data.
- **Public `?populate=` no longer returns draft or archived linked entries.**
- **Select fields can be created and edited in the admin again** — the editor sent choices as a comma-separated string, which the schema validator rejects.
- **Docker: `prisma migrate deploy` works in the backend image.** The Prisma CLI was a dev dependency, so the production image ran `npx prisma` without it (fetching the latest Prisma, which can't read this schema). `prisma` is now a runtime dependency.
- **A plugin turned off in the admin came back on after a restart, and its saved settings reverted to the defaults.** The saved state was applied at startup before plugins were registered, so it matched nothing; registration now happens first.
- **Controllers in a plugin's sub-modules are gated too:** disabling a plugin now 404s the controllers of every module only that plugin imports, not just those in its root module.
- **The bundled word-count and SEO plugins wrote keys the core then mangled** (`_wordCount` was stored as `_wordcount`, because entry data keys are lowercased on save). They now write `_word_count`, `_reading_time_minutes`, `_seo_score` and `_seo_suggestions`. Entries saved earlier keep the old lowercased keys until they are next saved.
- The Plugins page described plugins as "sandboxed"; they run in the server process. The text now says what is actually enforced.
- **The frontend Docker image could not be built:** `frontend/Dockerfile` copies `/app/public`, but the directory didn't exist. It now holds a `favicon.ico`, which also ends the 404 on every page; `app/icon.svg` provides the `<link rel="icon">` (a brand logo still overrides it).
- **Dropdowns showed raw values instead of labels** ("all" instead of "All languages", lowercase status values, ids). The `Select` wrapper now derives Base UI's `items` from its `<SelectItem>` children, so every `<SelectValue>` shows the selected item's label; the entry status triggers no longer draw a second colour dot.
- **The entries API accepted slugs that break URLs and empty locales.** `POST /api/entries`, the public `POST /api/:type` and new rows in entry import now require lowercase letters, numbers and hyphens/underscores (what the admin slug field produces); changing an existing entry's slug is checked too, while older entries keep saving. Locales are validated and stored canonically (`pt-br` → `pt-BR`, which "Add translation" used to lowercase) and a blank locale means `en` instead of being stored empty.
- **Rich-text toolbar buttons stole focus from the editor,** so keystrokes right after a click went to the button (a space re-clicked it) and the selection could be lost. Toolbar buttons now keep the editor focused, and the editor ignores stale echoes of its own HTML from the form.
- **New entries got a one-letter slug.** The slug auto-generation watcher treated its own `setValue('slug', …)` as a manual edit, so it stopped after the first character of the title ("Fast typing check" → `f`). Manual edits are detected in the slug input itself, so the watcher no longer does.
- **`/plugins` was missing from the admin middleware lists**, so the page was not redirected for logged-out or non-admin users (its API was already admin-only). It is now admin-only like the rest of the Developer section.
- **Content types with Color, Date, Date & Time or JSON fields could not be created or edited through the API.** `FieldDto` had its own hard-coded type list, missing the four newest types, so the request was rejected with 400. It now validates against the canonical `ALL_FIELD_TYPES`, with a test covering every registered type.
- **Schema import could apply half a bundle.** A schema the validator rejected only failed when its turn came, after earlier content types in the same bundle were already written. The import now validates everything first and changes nothing if any schema is invalid; the dry run runs the same validation, so a passing dry run means the import succeeds.
- **`npm run test:e2e` sent real email.** The suite loaded `SMTP_*` from `backend/.env`, so invite, password-reset and form-email tests sent mail through the configured SMTP account to addresses such as `editor@test.com`. `test/jest.setup.ts` now blanks the SMTP settings (`E2E_ALLOW_SMTP=1` overrides), and a test fails if mail is configured during e2e runs.
- **Scheduled publishing could stop running when scaled out.** The cron jobs took a Postgres session advisory lock and released it in a separate query; with Prisma's connection pool the release could run on a different connection, leaving the lock held so other instances skipped the job (and it never worked through a transaction-mode pooler like pgbouncer). Scheduled publishing now promotes each entry with a conditional update, so it is safe on every instance and each entry's webhook fires exactly once; weekly maintenance is idempotent and needs no lock.
- **Fresh installs could not create their first admin.** `twoFactorEnabled`/`twoFactorSecret`/`twoFactorRecovery` on `users` and the whole `installed_plugins` table were in `schema.prisma` with no migration, so any database built by `prisma migrate deploy` (every Docker install) returned a 500 on `POST /api/auth/register` (`column "twoFactorEnabled" does not exist`). Backfilled by migration `20261016110000_add_two_factor_and_installed_plugins`, written with `IF NOT EXISTS` so databases synced via `prisma db push` upgrade cleanly too.
- **Behind nginx, the whole site was rate-limited as a single client.** Express didn't trust the proxy, so every request's IP was nginx's: 120 requests/min was a site-wide cap and audit logs recorded the proxy. New `TRUST_PROXY` env (default: private networks only).
- **Rate limits multiplied with replicas.** The global throttler kept counters in process memory; with `REDIS_URL` set they now live in Redis (atomic Lua increment), falling back to memory if Redis is down.
- **Realtime never used Redis.** The gateway's namespace has no `adapter()`, so `server.adapter is not a function` was swallowed and every instance stayed on the in-memory adapter — live events only reached clients on the same replica. The adapter is now set on the root server (verified across two instances).
- **Realtime CORS with more than one origin.** The comma-separated `CORS_ORIGIN` was passed to Socket.io verbatim and matched nothing; HTTP and Socket.io now share one origin check (`common/cors-origin.ts`).
- **`docker-compose.prod.yml` + PgBouncer.** Transaction pooling without `?pgbouncer=true` makes Prisma fail with "prepared statement already exists" under load; the URL now sets it plus `connection_limit=${DB_POOL_SIZE:-10}`.
- **The e2e suite could not run** — `htmlparser2` 12 is ESM-only; `test/jest-e2e.json` now transforms it like the unit config does. 14 stale tests were updated (invite-only users, `contentTypeId` as a query param on import); all 187 now pass.
- **`?where[...]`, `?filters[...]` and `?filter[...]` were silently ignored.** Express 5 defaults to the "simple" query parser, so `where[price][gt]=10` arrived as one flat key and every filtered request returned unfiltered results. The app now parses nested query strings with `qs` (depth 5, safe defaults — not Express's `allowPrototypes` "extended" mode).
- **Admin-panel edits never reached the public API cache.** Only writes through `/api/{type}` invalidated it, so publishing, unpublishing, editing or deleting in the admin stayed stale on the public API for up to 60 s. Every `Entry`/`ContentType` write — admin, scheduler, imports, plugins — now invalidates it via a Prisma middleware, using per-content-type cache generation counters (one O(1) `INCR` per touched type, no Redis `SCAN`). A write clears only the content types it touched, so a busy collection no longer empties the cache for every other type; bulk writes that match no rows (e.g. an idle scheduler run) clear nothing.
- **Public API writes skipped webhooks, realtime events and plugin hooks.** `POST/PUT/DELETE /api/{type}` with an API key now fire `entry.created/updated/deleted` webhooks (so site rebuilds trigger), live admin updates and `ENTRY_AFTER_*` plugin hooks, like admin writes.
- **Admin live updates and entry presence/locking never worked.** The browser connected to Socket.io's default `/` namespace while the gateway listens on `/realtime`; the connection succeeded but received no events. The client now connects to `/realtime`, and falls back to the page origin (correct behind nginx) instead of `localhost:3001` when `NEXT_PUBLIC_API_URL` is unset.
- **The bundled nginx could not start.** `proxy.conf` was mounted into `conf.d/`, which nginx includes at the `http` level where its `location` blocks are invalid. It is now mounted at `/etc/nginx/snippets/`. Also: `/sitemap.xml` and `/robots.txt` were proxied to a backend path that doesn't exist, and `/api/draft` (Next.js live preview) was sent to the backend instead of the frontend.
- **`GET /api/health` returned 503 on busy servers.** Memory was "down" above a fixed 512 MB heap, which load balancers treat as a dead replica. The threshold is now 90% of the actual V8 heap limit (`HEALTH_MAX_HEAP_MB` overrides). The `uploads/` directory is also created at boot, so a fresh install isn't reported unhealthy before its first upload.
- **Version numbers now agree across the repo** — `package.json`, `backend/`, and `frontend/` all said `1.0.0` while `cli/` said `1.3.0`, and the changelog listed `1.3.0` twice: once on 2026-04-19 and again on 2026-06-04, the latter *after* 1.4.0 and 1.5.0 had already shipped. So the June release went backwards and reused a version number, and nothing in the repo agreed on what the current version was. The June entry is renumbered **1.6.0** (every version now appears once, in descending order) and all four manifests are set to `1.6.0`. Published artifacts are left alone — npm still has `create-nodepress-app@1.3.0` and the `v1.3.0` tag still exists — with a note in the 1.6.0 entry recording the discrepancy. Versioning resumes from 1.6.0.

- **GraphQL crashed the backend on boot under NestJS 11** — `@nestjs/apollo@13` on Express 5 needs `@as-integrations/express5`, which was not installed; the app logged `The "@as-integrations/express5" package is missing` and exited before `Nest application successfully started`. Type-checking and the unit suite both passed regardless, so this was only reachable by actually booting the app. Added the adapter, plus `overrides` pinning `@apollo/server` to ^5 and `express` to ^5 in **both** the workspace root and `backend/package.json` — the legacy `@apollo/server-plugin-landing-page-graphql-playground` (a dependency of `@nestjs/apollo`, used by `playground: true`) drags in Apollo Server 4 and Express 4, which npm hoists to the root where they shadow the v5 packages the backend requires. The backend needs the override in its own manifest too, because CI and Docker install it standalone rather than through the workspace.

- **`sitemap.xml` listed `noIndex` entries** — entries flagged "exclude from search engines" (`seo.noIndex`) were still included in the auto-generated sitemap, contradicting the setting and submitting them to crawlers anyway. They're now filtered out (published, non-noindex entries only).
- **`?populate=` returned the raw (un-populated) entry after a normal read** — the public dynamic API cached single entries and lists under a key that ignored `populate`/`fields`, and read from that cache *before* checking for `populate`. So a plain `GET /api/blog/x` cached the raw entry, and a subsequent `GET /api/blog/x?populate=author` got the cached raw copy (relation left as a UUID). The `list` endpoint also only excluded `fields` (not `populate`) from caching. Fixed by skipping the cache read **and** write whenever `populate` or `fields` is present (matches the documented "caching is bypassed when populating" behaviour) in both `findOne` and `findAll`. `validate.sh` now seeds the cache with a raw read, then asserts `?populate` still resolves the relation.

### Performance
- **Indexed full-text search.** `?search=` (public API and admin list) now matches a stored generated `search_vector` column with a GIN index instead of computing `to_tsvector()` over every row: 670 ms → 1.6 ms on 200k entries. The migration rewrites the `entries` table once — run it in a maintenance window on very large installs.
- **Keyset pagination: `GET /api/:type?cursor=`.** Every list response now includes `meta.nextCursor`; passing it pages in constant time at any depth and skips `COUNT(*)` (166 ms → 0.04 ms at 100k rows deep). Lists also sort by `id` as a tiebreaker, so pages never repeat or skip rows sharing a timestamp. New index `(contentTypeId, createdAt, id)`.
- **Horizontal scaling in `docker-compose.prod.yml`.** Migrations run once in a one-off `migrate` service before any backend starts, and `backend`/`frontend` no longer pin `container_name`, so `--scale backend=3` works.
- Startup warning when `STORAGE_DRIVER=local` in production (uploads are lost on redeploy and invisible to other replicas).
- **Indexed fields.** Mark a field `"indexed": true` (or tick **Indexed** in the content type builder) and NodePress builds a partial expression index for it (`CREATE INDEX CONCURRENTLY`, in the background), matching the SQL Prisma generates for `?where[field][op]=` — equality filters on 200k rows go from a 16 ms scan to 0.1 ms. Unticking drops it.
- **Read replica support.** Set `DATABASE_REPLICA_URL` and public content reads (`GET /api/{type}`, `/api/{type}/{slug}`, `?populate=`) go to the replica; writes, the admin panel and previews stay on the primary. For `REPLICA_READ_AFTER_WRITE_MS` (default 5 s) after any write, reads use the primary so a lagging replica can't re-cache stale data.
- **Realtime across replicas behind nginx.** The bundled nginx now uses upstream blocks, with `ip_hash` for `/api/realtime` so Socket.io's long-polling fallback stays on one replica.

### Changed
- **Prisma 6** (from 5.22). Prisma 6 removed the `$use` middleware the public-cache invalidation ran on; `PrismaService` now applies a query extension, and code that needs to wrap every query registers with `prisma.onOperation()`. `Bytes` columns come back as `Uint8Array` instead of `Buffer`. Requires Node.js 18.18+. The Prisma CLI's `deepmerge-ts` is overridden to 8.x for a high-severity advisory.
- **CI workflow rewritten** (`.github/workflows/ci.yml`): installs from the root workspace lockfile (it used the stale per-workspace ones), adds a schema-drift check, Docker image builds and the Docker lockfile check, uses Postgres 17, and raises the unit-coverage thresholds to just under current coverage (42/40/36/42). Note: GitHub has not started an Actions run on this account since 2026-04-02 — the pre-push hook runs the same checks locally.
- **Form actions run in a background job queue, with retries.** Email and webhook actions used to run fire-and-forget in the request's process: a failed send was only logged, an action in progress was lost on restart or deploy, and the form webhook had no timeout. Each action is now a row in the new `jobs` table (migration `20261016140000_add_jobs`), run by a worker on every instance (`JOB_CONCURRENCY`, default 5) and retried after 1 and 10 minutes when it fails, times out (10 s) or gets a non-2xx response. The queue is generic — `JobsService.enqueue(type, payload)` + `registerHandler(type, fn)` — so plugins can use it too. Finished jobs are pruned weekly (done after 7 days, failed after 30).
- **Webhooks are delivered by a background queue.** Previously every content write sent its webhooks immediately from the request's process, with no limit — a burst of 10,000 writes meant 10,000 simultaneous outbound requests — and retries were capped at 50 per minute across the whole cluster. `fire()` now only inserts `webhook_deliveries` rows; a worker on every backend instance claims due rows with `FOR UPDATE SKIP LOCKED` and keeps at most `WEBHOOK_CONCURRENCY` (default 10) in flight, so instances share the queue and capacity grows with the instance count. Deliveries interrupted by a crash or restart are retried after a 60 s lease. Retry timing is unchanged (immediately, 5 min, 30 min). The enabled-webhook list is cached for 30 s instead of being queried on every write. New env vars: `QUEUE_WORKER`, `QUEUE_POLL_MS`, `WEBHOOK_CONCURRENCY`.
- **Duplicate bottom "Add Field" button now only appears on longer lists** — the content-type builder (new + edit) and the form builder repeat the header's Add Field (and Reorder, on content types) control below the last field so you don't have to scroll back up. With only a field or two the duplicate sat right under the header and read as redundant, so it's now shown only once the list has **4 or more fields**.
- **Form builder nested sub-fields get an orange accent border** — the recursive sub-field group in the form builder now uses the same orange left border as the content-type repeater/group editors, so nested structures are visually consistent across the two builders.

### Docs
- The auth docs said the refresh cookie is `SameSite=Strict`; it is `Lax`.
- The Media docs described a "✨ UI Transformer Modal" with presets and a srcset generator that does not exist; replaced with the actual transform parameters, focal points and limits.
- **Supabase setup now documented on all three docs surfaces** — the Option B2 README section was only in the README; the public site (`docs/index.html`) and the in-app `/docs` page carried local-PostgreSQL instructions only, so anyone following either of those hit the IPv6 `P1001` failure with nothing explaining it. Both now carry the pooled/direct connection-string split, the IPv6-only warning for `db.<ref>.supabase.co` (with the `dig` check), the `pgbouncer` query params, and the note that the local PostgreSQL install steps can be skipped.

- **Documented running against Supabase or another hosted PostgreSQL** — no code changes are needed (`schema.prisma` already declares both `url` and `directUrl`), but the setup has three non-obvious traps. Supabase's **Direct connection** host (`db.<ref>.supabase.co`) is IPv6-only without the IPv4 add-on, so it fails with `P1001: Can't reach database server` on most networks and looks like an outage rather than an unroutable address — the **Session pooler** is the IPv4 path for `DIRECT_URL`. `DATABASE_URL` needs `?pgbouncer=true&connection_limit=1` or Prisma throws `prepared statement "s0" already exists` intermittently under load. And `npm run migrate` (`prisma migrate dev`) can't work through the pooler because it needs a shadow database — `npx prisma migrate deploy` is the correct command. Added as **Option B2** under Installation.

- **Documented why PostgreSQL doesn't auto-start on macOS Ventura or newer** — macOS Background Task Management gates launch daemons independently of `launchctl`, so a daemon can be enabled, have a valid plist and `RunAtLoad`, and still never start at boot (`disposition=[enabled, disallowed]`). `launchctl bootstrap` masks it, because a manual start isn't gated — so it looks fixed until the next reboot. Added a Troubleshooting entry with the `log show` command that confirms it and the System Settings toggle that actually fixes it, alongside an entry for the `ECONNREFUSED ... port 3000` error that a stopped database produces.

- **Documented the `color`, `date`, `datetime`, and `json` field types on the website** — these four field types are fully supported in the app (content-type builder + entry form renderer) and were already in the in-app `/docs` table, but the public website docs (`docs/index.html`) Field Types table was missing them. Added rows with descriptions and JSON-value examples so the two docs surfaces match the product.
- **Syntax-highlighted website code blocks** — `docs/index.html` code samples are now colour-highlighted via highlight.js (Atom One Dark theme) instead of flat white text, including the hand-written Field Types schema examples.

---

## [1.6.0] — 2026-06-04

> Released to npm as `create-nodepress-app@1.3.0` and tagged `v1.3.0`. That number was a
> mistake — 1.4.0 and 1.5.0 had already shipped, so this release went backwards and reused
> 1.3.0. It is renumbered 1.6.0 here so the history reads in order; the published artifacts
> keep their original numbers and are not being rewritten. Versioning resumes from 1.6.0.

### Added
- **`--docker` flag for the CLI** — `npx create-nodepress-app <name>` now scaffolds for **local PostgreSQL by default** (Docker files omitted); pass `--docker` to include `docker-compose*.yml`, the `nginx/` + `monitoring/` configs, the root Docker Compose `.env`, and the `docker:*` npm scripts.
- **`--sentry` flag for the CLI (1.3.0) — Sentry is now opt-in** — scaffolded projects **omit Sentry by default**, saving ~100 MB of dependencies (`@sentry/nestjs`, `@sentry/profiling-node`, `@sentry/nextjs` and most of `@opentelemetry`) and shipping no error-tracking code. Pass `--sentry` to include the packages and config, then set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` to activate. The source was made resilient to the packages being absent — the backend loads `@sentry/*` via guarded indirect `require`s (`instrument.ts`, `SentryExceptionFilter`), `next.config.js` wraps `withSentryConfig` in a guarded `require`, and client error reporting now goes through `frontend/lib/report-error.ts` (which the CLI swaps for a no-op when Sentry is omitted, so `next build` has no static `@sentry/nextjs` reference). This dev repo keeps Sentry fully installed and wired.

### Fixed
- **Creating any entry with a richtext field returned HTTP 500** (`(0 , sanitize_html_1.default) is not a function`) — found running a scaffolded project end to end. `backend/tsconfig.json` was missing `esModuleInterop`, so the default import `import sanitizeHtml from 'sanitize-html'` (a CommonJS module with no `.default`) compiled to `mod.default` (undefined) instead of using the `__importDefault` helper. Enabled `esModuleInterop` (the NestJS-standard setting); this also required switching `cookie-parser` from a namespace import to a default import in `main.ts` (a namespace import is no longer callable under interop). The `validate.sh` smoke test now creates an entry **with a richtext field** and asserts the `<script>` tag is stripped, so this path is always exercised.
- **Production builds were broken** (found while validating a fresh scaffold). (1) The backend had no `tsconfig.build.json`, so `nest build` compiled `test/` + `prisma/seed-forms.ts` alongside `src/` and emitted to `dist/src/main.js` — breaking `start:prod` (`node dist/main`) and the Docker `CMD node dist/main.js`. Added `backend/tsconfig.build.json` (compiles `src/` only) so output lands at `dist/main.js`. (2) The frontend shipped dead Vite leftovers (`src/`, `index.html`, `vite.config.ts`); `next build` treated `src/pages/` as the Pages Router and failed resolving `antd`/`react-router-dom`. Removed them (the app lives in `app/`, `components/`, `context/`, `lib/`).
- **Prisma client not generated after a workspace install** — with npm workspaces, the hoisted `@prisma/client` postinstall can't find `backend/prisma/schema.prisma`, so a fresh `npm install` left the backend uncompilable (`Prisma.InputJsonValue` missing) and the dev server never booted ("backend not running") until the first migrate. The root `package.json` (this repo and scaffolded projects) now runs `cd backend && npx prisma generate` on `postinstall`. The backend `Dockerfile` is untouched, so production builds are unaffected.
- **Scaffolded `backend/.env` was missing `DIRECT_URL`** — the Prisma schema declares `directUrl = env("DIRECT_URL")`, so `npm run migrate` failed on a fresh project with `P1012: Environment variable not found: DIRECT_URL`. The CLI now writes `DIRECT_URL` (same value as `DATABASE_URL`, since local/Docker setups aren't pooled).

### Changed
- **One-command install via npm workspaces** — the project root is now an npm workspace covering `backend` and `frontend`. A single `npm install` at the root installs all dependencies (no more separate `cd backend && npm install` / `cd frontend && npm install`). `npm run install:all` is now just an alias for `npm install`.
- **CLI scaffolding** — `npx create-nodepress-app <name>` now generates a workspace-enabled root `package.json` and runs a single root install instead of three separate installs.
- **Generated `backend/.env` DATABASE_URL** — non-Docker scaffolds now write clear placeholders (`YOUR_PASSWORD` / `YOUR_NODEPRESS_DATABASE`) instead of a random password, so it's obvious the values must be filled in. Docker scaffolds keep the generated random password + `nodepress` db, which match the Compose-provisioned container and work out of the box.
- **Faster scaffold install** (CLI 1.2.2) — the scaffold's `npm install` now runs with `--no-audit --no-fund`. The post-install registry audit was the slowest step and a common "stuck after install" hang on slow/filtered networks; skipping it (auditing belongs in CI, not scaffolding) speeds the install and removes the vulnerability-report noise. The progress message now states it takes 1–2 minutes so the silent install phase doesn't look frozen.

### No migration required

---

## [1.5.0] — 2026-04-19

### Added
- **WebSocket authentication** — `RealtimeGateway` now verifies JWT or API key on every connection; unauthenticated clients receive an `error` event and are immediately disconnected; token passed via `auth.token` (Socket.io handshake) or `Authorization` header; API keys accepted via `auth.apiKey` or `X-API-Key` header for server-to-server use
- **Frontend passes JWT to WebSocket** — `useRealtimeEvents` hook now reads `np_token` from cookies and passes it as `auth: { token: 'Bearer ...' }` in the Socket.io connection options

### No migration required

---

## [1.4.0] — 2026-04-19

### Added
- **GraphQL mutations — entries** — `createEntry`, `updateEntry`, `deleteEntry` (soft), `purgeEntry`, `restoreEntry`, `restoreEntryVersion`, `bulkDeleteEntries`, `bulkPublishEntries`, `bulkArchiveEntries`, `bulkSetPendingReviewEntries`
- **GraphQL mutations — content types** — `createContentType`, `updateContentType`, `deleteContentType`
- **GraphQL mutations — webhooks** — `createWebhook`, `toggleWebhook`, `pingWebhook`, `deleteWebhook`
- **GraphQL Playground always-on** — Apollo Sandbox enabled in all environments (dev + production); `contentSecurityPolicy` disabled on backend (API server, not an HTML app); `Cache-Control: no-store` added to `/graphql` in Next.js to prevent browser caching stale CSP headers

### No migration required

---

## [1.3.0] — 2026-04-19

### Added
- **Forgot-password dev mode** — when SMTP is not configured and `NODE_ENV !== 'production'`, `POST /api/auth/forgot-password` now includes `devResetUrl` in the response; the frontend displays the reset link directly on the page with Copy and Open buttons — no terminal required
- **Session-expired banner** — when the refresh token expires, the axios interceptor redirects to `/login?reason=expired`; the login page shows an amber "Your session expired" banner so users understand why they were signed out
- **Permissions role detail panel** — clicking a role card on the Permissions page now fetches and displays all permission overrides for that role via `GET /api/permissions/:role`
- **GraphQL Playground link in sidebar** — Developer nav group includes an external link to `/graphql` (Apollo Sandbox) available in all environments with `↗` indicator
- **Setup page credentials reminder** — after completing setup, an amber warning advises saving credentials and documents the Prisma Studio fallback for recovery without SMTP

### Changed
- **JWT access token lifetime** changed from `15m` to `7d` — better developer experience for internal admin tools; refresh tokens remain 30 days with silent rotation
- **Cookie expiry now matches JWT lifetime** — `np_token` cookie was previously set for 7 days while the JWT inside expired in 15 minutes, causing confusing middleware redirects; both are now aligned to 7 days
- **Login error messages now distinguish failure types** — `401` → "Invalid email or password", `429` → "Too many attempts, wait a minute", no response → "Cannot connect to the server", `5xx` → "Server error"
- **Rate limits relaxed in development** — login raised from 10 to 100 req/min, forgot-password from 5 to 50 req/min; production limits unchanged
- **`pino-pretty` moved to `devDependencies`** — not needed in production Docker image (transport is disabled when `NODE_ENV=production`)
- **`@types/cookie-parser`, `@types/nodemailer`, `@types/sanitize-html` moved to `devDependencies`** — type-only packages have no runtime role
- **`shadcn` moved to `devDependencies`** in frontend — CLI code generator, no runtime import

### Fixed
- **WebSocket (Socket.io) broken through nginx in production** — `/api/realtime` lacked `Upgrade` and `Connection` headers in `nginx/proxy.conf`; real-time events were silently falling back to HTTP polling; dedicated location block added with `proxy_read_timeout 3600s`
- **CORS missing PATCH method** — `backend/src/main.ts` CORS config omitted `PATCH`; `PATCH /api/webhooks/:id/toggle` was silently blocked in browsers; `PATCH` added to allowed methods
- **GraphQL Playground 404 through Next.js proxy** — `/graphql` was not included in `next.config.js` rewrites; clicking the Playground link hit Next.js 404 instead of Apollo Sandbox; rewrite added
- **Sidebar Metrics link removed** — `/api/metrics` returns unreadable Prometheus text in dev and a 403 in production; Grafana sidebar link removed entirely (Grafana remains available as an optional Docker add-on documented in README)
- **GraphQL Playground blank page** — Helmet's `contentSecurityPolicy` blocked scripts from `cdn.jsdelivr.net` and `fonts.googleapis.com` loaded by the playground; CSP disabled on the backend (API servers serving JSON gain no meaningful protection from CSP; Swagger UI and GraphQL Playground both require external CDN resources)
- **GraphQL Playground dev-only restriction lifted** — `introspection` and `playground` were disabled in production; both are now always enabled so developers can explore the API in any environment
- **TypeScript errors in entry locale Select** — `onValueChange={setLocale}` in `entries/[id]/edit/page.tsx` and `entries/new/page.tsx` passed `Dispatch<SetStateAction<string>>` where `(value: string | null) => void` was expected; fixed with null guard wrapper
- **`backend/.env.example`** — `JWT_EXPIRES_IN` comment updated from `15m` to `7d`; SMTP description updated to reflect browser UI display (not server console) for dev mode reset links

### No migration required

---

## [1.2.0] — 2026-04-18

### Added
- **Form spam protection** — 3-layer defence on every `POST /api/submit/:slug`:
  - Rate limiting (20 req/min per IP via `@nestjs/throttler`)
  - Honeypot field (`_honey`) — non-empty value silently drops submission; bots never notified
  - Captcha verification — set `CAPTCHA_PROVIDER` (turnstile | hcaptcha | recaptcha) + `CAPTCHA_SECRET_KEY` in env; enable per-form with `captchaEnabled: true`; passes `captchaToken` from the client widget to the server for verification; fails open in dev if no provider is configured
- **Nested populate (dot-notation)** — `?populate=author,author.company,author.company.address` resolves relation chains up to 3 levels deep with one batched DB query per depth level; shared `populate.util.ts` used by both REST and admin APIs; caching bypassed when `?populate` is present
- **Socket.io Redis adapter** — when `REDIS_URL` is set, `@socket.io/redis-adapter` is dynamically attached in `RealtimeGateway.afterInit()`; syncs rooms and events across all backend instances; fails open (falls back to in-memory adapter on error, logs a warning)
- **Configurable audit log retention** — `AUDIT_LOG_RETENTION_DAYS` env var (default 90); scheduler reads the env at runtime; documented in `.env.example` and self-hosting table
- **Bulk entry operations** — `POST /api/entries/bulk-publish`, `bulk-archive`, `bulk-pending-review`, `bulk-delete` — all accept `{ ids: number[] }`
- **Export / import entries** — `GET /api/entries/export?contentTypeId=X` returns a JSON array; `POST /api/entries/import` upserts by slug+locale, returns `{ created, updated, errors }`
- **Draft preview tokens** — `POST /api/entries/:id/preview-url` returns a 1-hour signed JWT; `GET /api/:type/:slug/preview?token=<token>` serves the entry regardless of publish status
- **`?fields=` projection on admin entries API** — `GET /api/entries/:id?populate=...` now supported; comma-separated field projection strips non-requested data keys from the response

### Fixed
- `graphql.module.ts` — `ValidationContext.getAncestors()` removed in graphql-js v16; rewrote depth-limit rule to use the visitor function's 5th `ancestors` parameter
- `forms.e2e-spec.ts` — submission tests updated to use `{ data: { ... } }` wrapper matching `SubmitFormDto` shape; assertions updated from `res.body.id` to `res.body.submissionId`
- `.env.example` fully synced: added `DIRECT_URL`, `JWT_EXPIRES_IN`, `SMTP_SECURE`, `CAPTCHA_PROVIDER`, `CAPTCHA_SECRET_KEY`, `AUDIT_LOG_RETENTION_DAYS`, `ROBOTS_DISALLOW`

### Migration required
```bash
npx prisma migrate deploy
```
Applies:
- `20260418124205_add_form_captcha_enabled` — adds `captchaEnabled Boolean @default(false)` to the `forms` table

---

## [1.1.0] — 2026-04-07

### Added
- **i18n / Multi-locale** — `locale` field on every entry; composite unique key `(contentTypeId, slug, locale)`; `?locale=` filter on all public and admin APIs
- **Content Relations** — `relation` field type storing publicId UUIDs; `?populate=field1,field2` to inline related entries on any endpoint
- **GraphQL API** — Apollo Server at `/api/graphql`; resolvers for entries, content types, media, webhooks; optional JWT guard for public/private queries; query depth limit (max 6)
- **Real-time WebSocket** — Socket.io gateway at `/api/realtime`; `global` room + per-content-type rooms (`ct:<name>`); events: `entry:created`, `entry:updated`, `entry:deleted`, `media:uploaded`, `media:deleted`
- **Granular Roles** — `contributor` and `viewer` roles added alongside `admin` and `editor`
- **Permission matrix** — `Permission` DB table with role + contentType + actions[]; admin UI at `/users/permissions`; `GET/PUT /api/permissions` endpoints
- **Schema versioning** — Content type schema snapshots saved before each update; `GET /api/content-types/:id/schema-history` endpoint
- **Prometheus alerting rules** — `monitoring/alerts.yml` with rules for high error rate, high latency, high memory, and backend-down
- **Frontend stale-while-revalidate cache** — `lib/useFetch.ts` hook; cached API responses reused on navigation; background revalidation after 30 s
- **`useRealtimeEvents` hook** — `lib/useRealtimeEvents.ts`; typed handlers for all 5 WebSocket event types; automatic room subscriptions

### Fixed
- `auth.service.ts` — removed 9 `(this.prisma as any)` casts for `refreshToken` and `passwordResetToken`; now fully typed
- `dynamic-api.service.ts` — `findOne` referenced undefined `query` variable (runtime bug); fixed with proper `query: PublicSingleQuery` parameter
- `dynamic-api.service.ts` — `create`/`update`/`remove` used stale `contentTypeId_slug` unique key; updated to `contentTypeId_slug_locale`
- `dynamic-api.service.ts` — empty full-text search results now use `{ in: [-1] }` sentinel to prevent returning all entries
- `forms.service.ts` — `as any` casts replaced with `Prisma.InputJsonValue` / `Prisma.FormUpdateInput`
- `entries.service.ts` — JSON field casts replaced with `Prisma.InputJsonValue`
- CI — E2E tests now run in GitHub Actions with real PostgreSQL + Redis services (previously only type-check ran)
- Rate limit 429 response now includes `Retry-After: 60` header

### Migration required
```bash
npx prisma migrate deploy
```
Applies:
- `20260407100000_add_permissions` — permissions table
- `20260407110000_add_i18n_locale` — locale column + updated unique index on entries
- `20260407120000_add_schema_versions` — content_type_schema_versions table

---

## [1.0.0] — 2026-04-01

### Added
- Visual content type builder with drag-and-drop field ordering
- Field types: text, textarea, richtext (TipTap), number, boolean, select, image, repeater, flexible
- Auto-generated REST API for every content type (`GET /api/:type`, `GET /api/:type/:slug`)
- Entry versioning — every save creates a restorable snapshot
- Soft delete with trash/restore/purge flow
- Scheduled publishing via `publishAt` field
- Media library with Sharp image optimisation and automatic WebP generation
- Local disk storage and S3/R2/MinIO storage drivers
- API keys with granular permissions (read / write / all, per content type)
- Per-key rate limiting (120 req/min read, 60 req/min write)
- JWT authentication with refresh token rotation (15 min access, 30 day refresh)
- Password reset via email
- Form builder with email and webhook actions
- Webhooks with HMAC-SHA256 signing and exponential-backoff retry (3 attempts)
- Audit log with 90-day retention
- User management (admin role)
- Prometheus metrics endpoint (`GET /api/metrics`)
- Sitemap and robots.txt generation (`SITE_URL` env var)
- Health check endpoint (`GET /api/health`)
- Plugin system for extending the backend
- Redis-backed cache (falls back to in-memory)
- Distributed cron safety via PostgreSQL advisory locks
- `create-nodepress-app` CLI for zero-config scaffolding
- Docker Compose setup for development and production (includes PgBouncer, Nginx, Prometheus, Grafana, automated backups)
- Interactive API docs page at `/docs`

---

## Upgrading

### From any version to a newer MINOR or PATCH

```bash
cd your-project
git pull
cd backend && npx prisma migrate deploy && npm install
cd ../frontend && npm install
```

Prisma applies only the new migrations — your existing data is safe.

### From a MAJOR version

Read the upgrade notes in the specific release before running migrations.
