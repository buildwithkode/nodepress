---
title: Docker
description: Run NodePress with Docker Compose, from a single-server stack to the production stack with PgBouncer, monitoring and nightly backups.
sidebar:
  order: 2
---

NodePress ships Docker Compose files that run the whole stack on one machine: PostgreSQL, Redis, the API, the admin panel and nginx in front. Use them on a VPS, or locally to try a production-like setup.

## Compose files

| File | What it is |
|---|---|
| `docker-compose.yml` | The standard stack. Generates its own secrets on first start. |
| `docker-compose.https.yml` | Adds Caddy for automatic HTTPS. Combine with `docker-compose.yml`. |
| `docker-compose.search.yml` | Adds Meilisearch for search. Combine with `docker-compose.yml`. |
| `docker-compose.prod.yml` | A larger standalone stack: PgBouncer, several backend replicas, Prometheus, Grafana and nightly database backups. |

The API and admin images come from `backend/Dockerfile` and `frontend/Dockerfile` (Node.js 22). You can pull them ready-made or build them yourself.

## Ready-made images

Every release is published as two images, for `linux/amd64` and `linux/arm64`:

| Image | What it is |
|---|---|
| `ghcr.io/buildwithkode/nodepress-backend` | The API |
| `ghcr.io/buildwithkode/nodepress-frontend` | The admin panel |

Each release is tagged with its version (`1.8.0`), its minor line (`1.8`) and `latest`. Set the version to run in `.env`, so the server doesn't move to a new release by itself:

```bash title=".env"
NODEPRESS_VERSION=1.8.0
```

Then `docker compose pull && docker compose up -d` runs it without building. The [one-line installer](/deployment/self-hosting/#one-line-installer) does this for you.

The ready-made images contain stock NodePress only. Build your own when you've changed the code or added bundled plugins (plugins uploaded in the admin work with both). The admin's error reporting to Sentry (`NEXT_PUBLIC_SENTRY_DSN`) is fixed when the admin is built, so it also needs your own build; the API's `SENTRY_DSN` works with either.

:::caution[Projects created with create-nodepress-app]
`--docker` keeps the Compose files and `nginx/`, but a scaffolded project has no `scripts/` folder, and the Compose files mount files from it: `docker-compose.yml` needs `scripts/docker-secrets-init.sh`, and the backup service in `docker-compose.prod.yml` needs `scripts/backup.sh` and `scripts/backup-crontab`. Copy them from the [NodePress repository](https://github.com/buildwithkode/nodepress/tree/main/scripts) before the first `up`.

A project has its own code, so build its images (`up -d --build`) rather than pulling the ready-made ones. New projects name their images `localhost/<project>/…` in `.env` (`NODEPRESS_IMAGE_PREFIX`, `NODEPRESS_VERSION=local`), so a stray `docker compose pull` can't replace them. In a project created before that, add those two lines to `.env` yourself.
:::

## The standard stack

```bash
docker compose pull && docker compose up -d   # ready-made images
docker compose up -d --build                  # or build from this folder
```

Open `http://localhost/setup` (or your server's address) to create the admin account. Pulling takes about a minute; the first build takes a few minutes.

| Service | What it does |
|---|---|
| `secrets-init` | Runs once before the others. Generates `JWT_SECRET` and the database password into the `secrets_data` volume, then exits. |
| `db` | PostgreSQL 16. |
| `redis` | Redis 7, 128 MB, used for the cache, rate limits and live updates. |
| `backend` | The API. Runs `prisma migrate deploy`, then starts. |
| `frontend` | The admin panel on port 3001 (internal). |
| `nginx` | Publishes ports 80 and 443 and routes requests. See [nginx](#nginx). |

Only nginx publishes ports. The database, Redis and the backend are reachable only inside the Docker network.

### Secrets

You don't need a `.env` file to start. On the first `up`, `secrets-init` generates a random JWT secret and database password and keeps them in the `secrets_data` volume; later starts reuse them. To use your own values, set them in a `.env` file next to `docker-compose.yml`. A value set there always wins and is written through on every start.

```bash title=".env"
JWT_SECRET=<at least 32 characters>
DB_PASSWORD=<database password>
```

Changing `DB_PASSWORD` after the database exists doesn't change the password inside PostgreSQL. Change it there too (`ALTER USER postgres PASSWORD '…'`).

### Configuration

Docker Compose reads `.env` in the project folder for these values:

| Variable | Default | Meaning |
|---|---|---|
| `SITE_URL` | `http://localhost` | The site's public URL. |
| `CORS_ORIGIN` | `SITE_URL` | Allowed browser origins. |
| `APP_URL` | `http://localhost` | The site's public URL, without `/api`. Files on local disk get URLs under `<APP_URL>/uploads/`. |
| `POSTGRES_DB`, `POSTGRES_USER` | `nodepress`, `postgres` | Database name and user. |
| `JWT_SECRET`, `DB_PASSWORD` | generated | See [Secrets](#secrets). |

The backend container doesn't read `backend/.env`: it gets only the variables listed under `backend.environment` in the Compose file. To set anything else, such as `SMTP_*`, `STORAGE_*` or `METRICS_TOKEN`, add it there. Email and file storage can also be set up in the admin under **Settings → Email & storage**, with no file changes. See [Email](/deployment/email/) and [Storage](/deployment/storage/).

:::note[Older installs]
Before 1.7.2 the default `APP_URL` ended in `/api`, which gave files on local disk URLs under `/api/uploads/`. nginx now serves those too, so existing media keeps loading; new uploads get `/uploads/` URLs.
:::

## HTTPS with Caddy

`docker-compose.https.yml` puts Caddy in front of nginx. Caddy gets and renews a Let's Encrypt certificate for your domain and redirects `www.<domain>` to it. It needs Docker Compose v2.24 or newer.

1. Point the domain's DNS `A`/`AAAA` record at the server, and open ports 80 and 443.
2. Start the stack with both files:

```bash
DOMAIN=cms.example.com ACME_EMAIL=you@example.com \
  docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
```

You can put `DOMAIN` and `ACME_EMAIL` in `.env` instead. The override sets `SITE_URL` and `CORS_ORIGIN` to `https://<DOMAIN>` and takes ports 80 and 443 from nginx, which keeps running behind Caddy. The [one-line installer](/deployment/self-hosting/#one-line-installer) does all of this for you.

## Meilisearch

`docker-compose.search.yml` adds a Meilisearch container and switches the backend's search to it:

```bash
MEILI_MASTER_KEY=$(openssl rand -hex 24) \
  docker compose -f docker-compose.yml -f docker-compose.search.yml up -d --build
```

`MEILI_MASTER_KEY` must be at least 16 characters; keep it in `.env` so it stays the same between starts. Build the index once after the first start (later writes keep it current). See [Search](/deployment/search/#build-the-index). Add `-f docker-compose.https.yml` to combine it with HTTPS.

## The production stack

`docker-compose.prod.yml` is a separate stack for a bigger server. It needs a `.env` with at least these values, and refuses to start without the first two:

```bash title=".env"
DB_PASSWORD=<database password>
JWT_SECRET=<at least 32 characters>     # openssl rand -hex 48
SITE_URL=https://cms.example.com
CORS_ORIGIN=https://cms.example.com
APP_URL=https://cms.example.com
```

```bash
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
# or build from this folder: docker compose -f docker-compose.prod.yml up -d --build
```

It uses the same images as the standard stack; set `NODEPRESS_VERSION` in `.env` as above.

| Service | What it does |
|---|---|
| `db` | PostgreSQL 16. |
| `redis` | Redis 7, 256 MB. |
| `pgbouncer` | Connection pooler in transaction mode. The backend connects through it. |
| `migrate` | Runs `prisma migrate deploy` once per `up`, over a direct connection, before any backend starts. |
| `backend` | The API. Can run as several replicas. |
| `frontend` | The admin panel. |
| `nginx` | Publishes ports 80 and 443. |
| `prometheus`, `grafana` | Metrics and dashboards. See [Monitoring](/deployment/monitoring/#the-monitoring-stack). |
| `backup` | Nightly database dump. See [Backups](/deployment/backups/#the-docker-backup-service). |

Every service has a memory limit (the backend: 512 MB and one CPU).

### Connection pooling

The backend's `DATABASE_URL` goes through PgBouncer with `?pgbouncer=true&connection_limit=<DB_POOL_SIZE>`. `DB_POOL_SIZE` (default `10`) is the number of connections each backend replica opens. PgBouncer accepts up to 200 client connections and keeps 20 open to PostgreSQL. Migrations use `DIRECT_URL`, which bypasses PgBouncer.

### More backend replicas

```bash
docker compose -f docker-compose.prod.yml up -d --scale backend=3
docker compose -f docker-compose.prod.yml restart nginx
```

nginx looks up the backend replicas when it starts, so restart it after changing the count. Redis keeps the cache, rate limits and live updates in sync across replicas. Uploads must be on [S3-compatible storage](/deployment/storage/), because each replica would otherwise only see its own disk. See [Scaling](/deployment/scaling/).

### HTTPS

`docker-compose.https.yml` extends the standard stack, not this one. For the production stack, get a certificate (for example with certbot), uncomment the `/etc/letsencrypt` volume on the `nginx` service and the HTTPS `server` block in `nginx/default.conf`, and replace `YOUR_DOMAIN` with your domain.

### Extra settings

S3, SMTP and `METRICS_TOKEN` lines are already in the `backend` service's `environment`, commented out. Uncomment the ones you need and set their values in `.env`.

## nginx

`nginx/default.conf` defines the server, and `nginx/proxy.conf` holds the routes (mounted at `/etc/nginx/snippets/`, never under `conf.d/`). The routes:

| Path | Goes to | Notes |
|---|---|---|
| `/api/metrics` | blocked | Returns 403. Prometheus scrapes the backend directly. |
| `/api/realtime` | backend | WebSocket upgrade. Each client IP sticks to one replica. |
| `/api/draft`, `/api/disable-draft` | frontend | Live preview draft mode. |
| `/api/` | backend | 60 requests per minute per IP, bursts of 30. |
| `/api/media/upload` | backend | 10 uploads per minute per IP, bursts of 10. |
| `/uploads/` | backend | Cached by browsers for 7 days. |
| `/graphql` | backend | |
| `/sitemap.xml`, `/robots.txt` | backend | Served from `/api/sitemap.xml` and `/api/robots.txt`. |
| everything else | frontend | |

Request bodies are limited to 50 MB (the API's own limit for uploads is 10 MB). nginx also adds `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` headers.

nginx runs on the Docker network, so the backend's default `TRUST_PROXY` already trusts it. If you put a CDN or another proxy on a public IP in front, see [TRUST_PROXY](/deployment/self-hosting/#trust_proxy).

## Volumes

| Volume | Holds | Stack |
|---|---|---|
| `postgres_data` | The database | both |
| `redis_data` | Redis data | both |
| `uploads_data` / `uploads` | Uploaded files on local disk | standard / production |
| `secrets_data` | Generated JWT secret and database password | standard |
| `caddy_data`, `caddy_config` | Certificates | HTTPS override |
| `meili_data` | The Meilisearch index | search override |
| `prometheus_data`, `grafana_data` | Metrics (kept 15 days) and Grafana settings | production |
| `backups` | Nightly database dumps | production |

:::danger
`docker compose down -v` deletes the volumes, including the database and uploads. Use `docker compose down` to stop the stack.
:::

## Common commands

```bash
docker compose logs -f backend          # follow the API's logs
docker compose ps                       # what's running
docker compose exec db psql -U postgres nodepress   # database shell
docker compose pull && docker compose up -d         # after changing NODEPRESS_VERSION
docker compose build && docker compose up -d        # rebuild your own images after an upgrade
```

To upgrade, see [Upgrading](/deployment/upgrading/#docker).
