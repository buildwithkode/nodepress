---
title: Environment variables
description: Every backend and admin environment variable NodePress reads, grouped by area, with its default and meaning.
sidebar:
  order: 1
---

The backend reads its settings from `backend/.env`, the admin from `frontend/.env.local`. A new project gets both files from the [CLI](/cli/create/#generated-files). `backend/.env.example` and `frontend/.env.local.example` document the same variables.

The backend checks its variables at startup. When one is missing or invalid, it prints the problem and exits instead of starting with a broken setup. These combinations are also refused:

- `STORAGE_DRIVER=s3` without `STORAGE_S3_BUCKET`, `STORAGE_S3_ACCESS_KEY` and `STORAGE_S3_SECRET_KEY`
- `SEARCH_DRIVER=meilisearch` without `MEILISEARCH_URL`
- `CAPTCHA_PROVIDER` without `CAPTCHA_SECRET_KEY`
- `OIDC_ISSUER` without `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`
- a `CDN_PURGE_DRIVER` without its credentials

Boolean variables take the strings `true` and `false`.

## Backend

### Required

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection URL the app uses. With a connection pooler, the pooled URL. |
| `DIRECT_URL` | Direct (non-pooled) PostgreSQL URL, used by migrations. Without a pooler, the same as `DATABASE_URL`. |
| `JWT_SECRET` | Signs access tokens and draft preview tokens. At least 32 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `CORS_ORIGIN` | The admin's origin, e.g. `https://admin.example.com`, without a trailing slash. Comma-separate several. Outside production, any `localhost` / `127.0.0.1` origin is also allowed. |

### Server

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port the API listens on. In development the admin picks it up from `backend/.env` automatically. |
| `NODE_ENV` | `development` | `development`, `production` or `test`. |
| `APP_URL` | `http://localhost:<PORT>` in development | The backend's public URL. Local media URLs, the OpenAPI server URL and logo links in emails are built from it. |
| `SITE_URL` | `http://localhost:5173` | The admin's public URL. Used in password reset and invitation links, the sitemap and the SSO callback. |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | Which proxies may set `X-Forwarded-For`, so rate limits and the audit log see the real client IP. The default trusts private networks (Docker nginx, Kubernetes ingress). Behind a CDN on a public IP, set a hop count such as `2`. |
| `LOG_LEVEL` | `debug` in development, `info` in production | `debug`, `info`, `warn` or `error`. |
| `JWT_EXPIRES_IN` | `7d` | Access token lifetime. Refresh tokens always last 30 days. |
| `SETTINGS_SECRET` | `JWT_SECRET` | Key for secrets saved in the database (SMTP password, S3 secret key). At least 32 characters. Changing it makes saved secrets unreadable, so re-enter them. |

`CORS_ORIGIN=*` sends a literal wildcard, which browsers refuse for signed-in (credentialed) requests. Never put the backend's own URL in `CORS_ORIGIN`.

### Database

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_REPLICA_URL` | none | Read replica for public content reads (`GET /api/{type}` and `GET /api/{type}/{slug}`). Writes, the admin and previews use `DATABASE_URL`. |
| `REPLICA_READ_AFTER_WRITE_MS` | `5000` | After a write, public reads stay on the primary this long, so the replica can catch up. |

See [Scaling](/deployment/scaling/).

### Redis

| Variable | Default | Meaning |
|---|---|---|
| `REDIS_URL` | none | e.g. `redis://localhost:6379`. Optional for one instance, required for several: it shares the cache, the rate-limit counters and real-time events between instances. Without it, each instance keeps them in memory. |

### Media storage

| Variable | Default | Meaning |
|---|---|---|
| `STORAGE_DRIVER` | unset | `local` (files in `backend/uploads/`) or `s3`. When unset, the storage chosen in **Settings → Email & storage** applies, else `local`. Read once at startup. |
| `STORAGE_S3_BUCKET` | none | Bucket name. Required with `s3`. |
| `STORAGE_S3_REGION` | none | Region, e.g. `us-east-1`. Use `auto` for Cloudflare R2. |
| `STORAGE_S3_ACCESS_KEY` | none | Access key ID. Required with `s3`. |
| `STORAGE_S3_SECRET_KEY` | none | Secret access key. Required with `s3`. |
| `STORAGE_S3_ENDPOINT` | none | Custom endpoint, for R2, MinIO, Backblaze B2 or DigitalOcean Spaces. |
| `STORAGE_S3_PUBLIC_URL` | none | Base URL for public file links, e.g. a CDN domain. |
| `MEDIA_MAX_DIMENSION` | `2400` | Uploaded images are scaled down to fit inside this many pixels on each side. Smaller images are never enlarged. |
| `IMAGE_TRANSFORM_CONCURRENCY` | `2` | How many on-the-fly image transforms (`/api/media/:file/transform`) encode at once. |
| `IMAGE_VARIANT_CACHE_MB` | `2048` | Size cap of the transformed-image cache. Pruned nightly. |

See [Storage](/deployment/storage/) and [Media](/content/media/).

### Email

| Variable | Default | Meaning |
|---|---|---|
| `SMTP_HOST` | none | SMTP server. When set, email settings come from these variables and are read-only in the admin. When unset, the settings saved in **Settings → Email & storage** apply. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (port 465), `false` for STARTTLS (port 587). |
| `SMTP_USER` | none | SMTP user name. |
| `SMTP_PASS` | none | SMTP password. |
| `SMTP_FROM` | none | Sender, e.g. `NodePress <noreply@example.com>`. |

Email is needed for password resets, invitations and form email actions. See [Email](/deployment/email/).

### Search

| Variable | Default | Meaning |
|---|---|---|
| `SEARCH_DRIVER` | `postgres` | `postgres` (built-in full-text search) or `meilisearch`. |
| `MEILISEARCH_URL` | none | Meilisearch URL. Required with `meilisearch`. |
| `MEILISEARCH_KEY` | none | Meilisearch master or admin key. |
| `MEILISEARCH_INDEX` | `nodepress_entries` | Index name. |

See [Search](/deployment/search/).

### CDN

| Variable | Default | Meaning |
|---|---|---|
| `CDN_PURGE_DRIVER` | `none` | `none`, `cloudflare`, `fastly` or `webhook`. Purges changed content types from the CDN on every write. |
| `CDN_CACHE_TTL` | `3600` with a purge driver, `30` without | `s-maxage` (seconds) on public published reads. |
| `CLOUDFLARE_ZONE_ID` | none | Required with `cloudflare`. |
| `CLOUDFLARE_API_TOKEN` | none | Required with `cloudflare`. Needs the Zone → Cache Purge permission. |
| `FASTLY_SERVICE_ID` | none | Required with `fastly`. |
| `FASTLY_API_TOKEN` | none | Required with `fastly`. Needs the `purge_select` scope. |
| `CDN_PURGE_WEBHOOK_URL` | none | Required with `webhook`. Receives a POST with the tags to purge. |
| `CDN_PURGE_WEBHOOK_SECRET` | none | Signs the webhook body: `X-NodePress-Signature: sha256=<hmac>`. |

See [CDN](/deployment/cdn/).

### Background queues

| Variable | Default | Meaning |
|---|---|---|
| `QUEUE_WORKER` | `true` | Whether this instance runs the webhook and job workers. Set `false` on API-only instances. |
| `QUEUE_POLL_MS` | `1000` | How often an idle worker checks for due work, in milliseconds. |
| `WEBHOOK_CONCURRENCY` | `10` | Webhook deliveries in flight per instance. |
| `JOB_CONCURRENCY` | `5` | Background jobs (form emails and webhooks, imports…) in flight per instance. |

### Forms

| Variable | Default | Meaning |
|---|---|---|
| `CAPTCHA_PROVIDER` | none | `turnstile` (Cloudflare), `hcaptcha` or `recaptcha`. Enables captcha checks on forms that turn it on. |
| `CAPTCHA_SECRET_KEY` | none | The provider's **secret** key. Required with `CAPTCHA_PROVIDER`. The site key belongs in your website's form, not here. |
| `FORM_MAX_DEPTH` | `3` | Maximum object/array nesting in a public form submission. |
| `FORM_MAX_ARRAY_ITEMS` | `100` | Maximum items in any array of a submission. |
| `FORM_MAX_FIELDS` | `200` | Maximum fields in a submission, counted after flattening. |
| `FORM_MAX_PAYLOAD_BYTES` | `102400` | Maximum submission size in bytes (about 100 KB). |

See [Forms](/content/forms/).

### Single sign-on (OIDC)

SSO is on when `OIDC_ISSUER` is set. See [Single sign-on](/access-control/sso/).

| Variable | Default | Meaning |
|---|---|---|
| `OIDC_ISSUER` | none | The identity provider's issuer URL, e.g. `https://accounts.google.com`. |
| `OIDC_CLIENT_ID` | none | Client ID. Required with `OIDC_ISSUER`. |
| `OIDC_CLIENT_SECRET` | none | Client secret. Required with `OIDC_ISSUER`. |
| `OIDC_PROVIDER_NAME` | `SSO` | Name on the login button: "Continue with *name*". |
| `OIDC_SCOPES` | `openid email profile` | Scopes to request. |
| `OIDC_REDIRECT_URI` | `<SITE_URL>/api/auth/oidc/callback` | Callback URL registered with the provider. |
| `OIDC_ALLOWED_DOMAINS` | any | Comma-separated email domains allowed to sign in. |
| `OIDC_AUTO_CREATE` | `false` | `true` creates an account on first sign-in. `false` admits only existing (invited) users. |
| `OIDC_DEFAULT_ROLE` | `viewer` | Role for auto-created users: `admin`, `editor`, `contributor` or `viewer`. |
| `OIDC_ROLE_CLAIM` | none | ID token claim holding group or role names, e.g. `groups`. |
| `OIDC_ROLE_MAP` | none | Maps claim values to roles, e.g. `cms-admins:admin,cms-editors:editor`. |

### Plugins

| Variable | Default | Meaning |
|---|---|---|
| `PLUGIN_UPLOADS` | `signed` | `signed` accepts only packages signed by a trusted key, `unsigned` accepts any valid package, `off` blocks uploads and deletes (installed plugins still load). |
| `PLUGIN_TRUSTED_KEYS` | none | Comma-separated Ed25519 public keys (base64url) whose signatures are accepted. |
| `PLUGIN_MAX_UPLOAD_MB` | `25` | Maximum plugin package size. |
| `PLUGINS_DIR` | `backend/.plugins` | Where uploaded packages are unpacked. |
| `PLUGIN_REGISTRY_URL` | the NodePress `plugins-registry.json` on GitHub | Plugin directory shown on the **Plugins** page under **Browse**. Fetched by the server and cached for an hour. An empty value turns it off. |

See [Plugins](/extending/plugins/).

### AI assistance

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Turns on AI help in the admin (content type suggestions, entry drafts). Prompts and field definitions are sent to the Claude API. |
| `AI_MODEL` | `claude-opus-5-5` | Claude model to use. |

See [AI assistance](/content/ai/).

### Monitoring

| Variable | Default | Meaning |
|---|---|---|
| `SENTRY_DSN` | none | Sends backend errors to Sentry. Needs the Sentry packages, which projects get with `--sentry`. |
| `METRICS_TOKEN` | none | Protects `GET /api/metrics`: Prometheus must send `Authorization: Bearer <token>`. Unset, the endpoint is open. |
| `HEALTH_MAX_HEAP_MB` | 90% of the V8 heap limit | `GET /api/health` reports memory as down (503) above this heap size. |

See [Monitoring](/deployment/monitoring/).

### Other

| Variable | Default | Meaning |
|---|---|---|
| `AUDIT_LOG_RETENTION_DAYS` | `90` | Audit log entries older than this are pruned weekly. |
| `REDIRECTS_ON_SLUG_CHANGE` | `true` | Adds a 301 redirect from a published entry's old path when its slug changes. |
| `ROBOTS_DISALLOW` | none | Comma-separated paths added as `Disallow` rules to `/api/robots.txt`. |
| `GRAPHQL_SCHEMA_POLL_MS` | `10000` | How often each instance checks whether content types changed on another instance, to rebuild its GraphQL schema. |

## Admin (frontend)

| Variable | Default | Meaning |
|---|---|---|
| `BACKEND_URL` | `http://localhost:3000` | The backend's URL as the admin server reaches it. The admin proxies `/api`, `/uploads` and `/graphql` to it. In Docker this can be an internal name such as `http://backend:3000`. |
| `NEXT_PUBLIC_API_URL` | the page's origin | The backend's URL as the browser reaches it, for the real-time (Socket.io) connection. Set it when the backend is on another host. |
| `NEXT_PUBLIC_BACKEND_URL` | none | Fallback for `BACKEND_URL` in server code. |
| `SITE_URL` | `http://localhost:5173` | The public site origin, used for absolute canonical and Open Graph URLs on public pages. |
| `NEXT_PUBLIC_SENTRY_DSN` | none | Sends admin errors to Sentry. Needs the Sentry packages, which projects get with `--sentry`. |

`NEXT_PUBLIC_*` values are built into the admin's JavaScript, so set them before `npm run build`.

:::tip[Changing the port in development]
When `BACKEND_URL` is unset or points at `localhost`, the admin reads `PORT` from `../backend/.env` and uses `http://localhost:<PORT>`, filling in `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_BACKEND_URL` too. Changing `PORT` in `backend/.env` is all you need locally. A remote `BACKEND_URL` is used as is.
:::

## Docker Compose

The Compose files read a root `.env` with their own variables (`DB_PASSWORD`, `JWT_SECRET`, `CORS_ORIGIN`, `APP_URL`, `SITE_URL`, and `DOMAIN` for the HTTPS setup) and pass them to the containers. See [Docker](/deployment/docker/).
