---
title: Self-hosting
description: Build NodePress for production, run it under a process manager behind a reverse proxy, and set the environment it needs.
sidebar:
  order: 1
---

NodePress is two Node.js programs: the API (`backend/`, NestJS) and the admin panel (`frontend/`, Next.js). In production you build both, run them under a process manager and put a reverse proxy in front. You also need PostgreSQL 14 or newer and, on most hosts, S3-compatible storage for uploads.

## Ways to deploy

| Option | Good for |
|---|---|
| [Docker Compose](/deployment/docker/) | One server (VPS) running everything: PostgreSQL, Redis, API, admin and nginx. |
| One-line installer | The Docker setup on a fresh Linux server, with optional automatic HTTPS. See [below](#one-line-installer). |
| [Render](#render) | A managed host with the `render.yaml` blueprint. |
| Node.js on your own server | Full control. The rest of this page; [Deploy on a server without Docker](/deployment/deploy-vps-node/) is the same as a step-by-step guide. |
| Other managed hosts | Railway, Fly.io, DigitalOcean App Platform and similar. See [Other managed hosts](#other-managed-hosts). |

## One-line installer

On a Linux server with Docker and Docker Compose v2, this downloads NodePress, writes `.env`, pulls the [ready-made images](/deployment/docker/#ready-made-images) for the release and starts the Docker stack:

```bash
curl -fsSL https://raw.githubusercontent.com/buildwithkode/nodepress/main/scripts/install.sh | bash
```

With `DOMAIN`, it also adds Caddy, which gets a Let's Encrypt certificate (this needs Docker Compose v2.24 or newer, and the domain's DNS must point at the server):

```bash
curl -fsSL https://raw.githubusercontent.com/buildwithkode/nodepress/main/scripts/install.sh \
  | DOMAIN=cms.example.com ACME_EMAIL=you@example.com bash
```

| Variable | Default | Meaning |
|---|---|---|
| `DOMAIN` | none | Public hostname. Without it the site runs on `http://<server-ip>`. |
| `ACME_EMAIL` | none | Email for Let's Encrypt expiry notices. |
| `NODEPRESS_DIR` | `./nodepress` | Install directory. |
| `NODEPRESS_REF` | the newest release | Git branch or tag to install. Without it, the newest `vX.Y.Z` release. Installs made before this followed `main` and stay on it (`NODEPRESS_TRACK=main` in `.env`). |
| `NODEPRESS_BUILD` | none | `1` builds the images on the server instead of pulling them. A branch such as `main`, and a release without images, are always built. |

When it finishes, open `/setup` on your site to create the admin account. The installer pins the release in `.env` (`NODEPRESS_VERSION`), so the server keeps running exactly that version. Running the installer again in the same place updates to the newest release and restarts the stack; `DOMAIN` and `ACME_EMAIL` are remembered, so you don't need to pass them again. For a full walkthrough, from renting the server to backups, see [Deploy on a server with Docker](/deployment/deploy-vps/). See [Docker](/deployment/docker/) for what it runs.

## Build

From the project folder:

```bash
npm install
npm run build                                # backend, then frontend
cd backend && npx prisma migrate deploy      # apply database migrations
```

Set the frontend's `BACKEND_URL` (see [Environment](#environment)) before `npm run build`: the admin's `/api` proxy to the backend is fixed when the frontend is built.

## Run

Run each program from its own folder. The backend reads `.env` from its working directory and stores local uploads in `uploads/` there, so start it from `backend/`:

```bash
# API, port 3000 by default (PORT)
cd backend && NODE_ENV=production node dist/main.js

# Admin panel
cd frontend && NODE_ENV=production npx next start -p 3001
```

:::caution[Set NODE_ENV=production]
Without it the backend allows CORS from any `localhost` origin, returns password-reset and invitation links in API responses, and pretty-prints logs with a development-only package that a production install may not have.
:::

`npm start` in `frontend/` uses port 5173, the development port. Pass `-p` to choose another.

### Process manager

Use a process manager that restarts the programs when they exit. NodePress relies on it: **Restart now** after a plugin or storage change stops the server and expects it to be started again. If a newly uploaded plugin breaks startup, NodePress switches it off and exits, so the next start comes up without it.

With [PM2](https://pm2.keymetrics.io/):

```js title="ecosystem.config.js"
module.exports = {
  apps: [
    {
      name: 'nodepress-api',
      cwd: './backend',
      script: 'dist/main.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'nodepress-admin',
      cwd: './frontend',
      // npm workspaces install Next.js in the root node_modules
      script: '../node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

```bash
pm2 start ecosystem.config.js
pm2 save && pm2 startup     # start again after a reboot
```

With systemd, one unit per program:

```ini title="/etc/systemd/system/nodepress-api.service"
[Unit]
Description=NodePress API
After=network.target

[Service]
WorkingDirectory=/srv/my-site/backend
ExecStart=/usr/bin/node dist/main.js
Environment=NODE_ENV=production
Restart=always
User=nodepress

[Install]
WantedBy=multi-user.target
```

## Environment

The backend validates its environment at startup and exits with a list of problems if something is missing or malformed. These are the variables a production install must get right. [Environment variables](/reference/environment-variables/) lists all of them.

**Backend** (`backend/.env`):

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string the app uses. With a connection pooler, the pooled URL. |
| `DIRECT_URL` | Direct (non-pooled) connection, used by migrations. Without a pooler, the same as `DATABASE_URL`. |
| `JWT_SECRET` | Signs login tokens. **At least 32 characters**, or the backend won't start. Generate one with `openssl rand -hex 32`. |
| `CORS_ORIGIN` | Required. Browser origins allowed to call the API, comma-separated, no trailing slash. |
| `NODE_ENV` | `production`. |
| `APP_URL` | The backend's public URL, without `/api`, for example `https://cms.example.com`. Local uploads get URLs under `<APP_URL>/uploads/`. |
| `SITE_URL` | The admin panel's public URL. Password reset and invitation links point here. |
| `PORT` | API port. Default `3000`. |

**Frontend** (`frontend/.env.local`, or the environment at build and start):

| Variable | Meaning |
|---|---|
| `BACKEND_URL` | Where the admin's server reaches the API, for example `http://127.0.0.1:3000`. Needed at build time and at runtime. |
| `NEXT_PUBLIC_API_URL` | Browser-reachable API origin for live updates (Socket.io). Leave it unset when your proxy serves `/api/realtime` on the admin's own domain, as the example below does. Set it before building when the API is on another domain. |
| `SITE_URL` | The public site origin, used for absolute canonical and social image URLs. |

### Which URL goes where

- `APP_URL` is the **backend's** public URL. `SITE_URL` and `CORS_ORIGIN` are the **frontend's**. Never put the backend's own address in `CORS_ORIGIN`.
- The admin panel calls the API through its own `/api` proxy, so it works even when the backend is on another host. `CORS_ORIGIN` matters for browsers that call the API directly: the live-update connection when the API is on another domain, and any website of yours that fetches content from the browser. Add those origins too.
- In production only the listed origins are allowed. A request from any other origin gets no CORS headers. `*` allows every origin, but browsers then refuse requests that send cookies.

## Reverse proxy

Put nginx, Caddy or your host's load balancer in front and terminate HTTPS there. One domain for both programs is simplest. These are the routes the [bundled nginx config](/deployment/docker/#nginx) uses:

| Path | Goes to |
|---|---|
| `/api/realtime` | Backend, with WebSocket upgrade headers |
| `/api/draft`, `/api/disable-draft` | Frontend (live preview draft mode) |
| `/api/`, `/uploads/`, `/graphql` | Backend |
| Everything else | Frontend |

A minimal nginx server block for programs on ports 3000 and 3001:

```nginx title="/etc/nginx/sites-available/nodepress"
server {
    listen 443 ssl http2;
    server_name cms.example.com;
    # ssl_certificate / ssl_certificate_key …

    client_max_body_size 50M;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # A location with its own proxy_set_header lines doesn't inherit the ones
    # above, so the WebSocket locations repeat them.
    location /api/realtime {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }

    location ~ ^/api/(draft|disable-draft)$ {
        proxy_pass http://127.0.0.1:3001;
    }

    location = /api/metrics { deny all; }

    location /api/    { proxy_pass http://127.0.0.1:3000; }
    location /uploads/ { proxy_pass http://127.0.0.1:3000; }
    location /graphql { proxy_pass http://127.0.0.1:3000; }

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

With this layout, `APP_URL`, `SITE_URL` and `CORS_ORIGIN` are all `https://cms.example.com`.

### TRUST_PROXY

`TRUST_PROXY` tells the backend which proxies may set `X-Forwarded-For`. If it's wrong, every visitor looks like the proxy: per-IP rate limits then throttle the whole site as one client, and the audit log records the proxy's address.

| Value | When |
|---|---|
| `loopback, linklocal, uniquelocal` (default) | The proxy is on the same machine or a private network: nginx on localhost, Docker, a Kubernetes ingress. |
| A number of hops, such as `2` | The request passes proxies on public IPs, for example Cloudflare in front of nginx. |
| Addresses or CIDR ranges | You know your proxies' addresses. |

## Database migrations

Run `npx prisma migrate deploy` in `backend/` on every deploy, before starting the new backend. It applies only migrations that haven't run yet and never resets data. It connects with `DIRECT_URL`, because migrations can't run through a transaction-mode pooler.

Don't use `prisma migrate dev` or `prisma db push` in production. `migrate dev` can reset the database, and `db push` fails on NodePress's schema.

## Create the first admin

Open `https://<your-site>/setup` and create the admin account. Setup works only while the database has no users. After it, add people from **Users**.

## Render

The repository's `render.yaml` blueprint (the **Deploy to Render** button in the README) creates a PostgreSQL database and two Docker web services:

| Service | What it runs |
|---|---|
| `nodepress-api` | The backend. Runs `prisma migrate deploy` on every start, health check `/api/health`, generates `JWT_SECRET`. |
| `nodepress-web` | The admin panel on port 3001. |

Render asks for five values on create. Fill them in after the first deploy, when you know the services' URLs, then redeploy:

| Service | Variable | Value |
|---|---|---|
| `nodepress-api` | `SITE_URL`, `CORS_ORIGIN` | The frontend's URL, such as `https://nodepress-web-xxxx.onrender.com` |
| `nodepress-api` | `APP_URL` | The backend's URL |
| `nodepress-web` | `BACKEND_URL`, `NEXT_PUBLIC_API_URL` | The backend's URL. Both are read at build time, so redeploy the admin after setting them. |

:::caution[Uploads on Render]
Render's disk is wiped on every deploy. Use [S3-compatible storage](/deployment/storage/), or attach a disk at `/app/uploads` (paid plans).
:::

## Other managed hosts

Most hosts run one process per service, so deploy the backend and the frontend as two services from the same repository, plus a managed PostgreSQL:

| | Backend | Frontend |
|---|---|---|
| Root directory | `backend` | `frontend` |
| Build | `npm install && npx prisma generate && npm run build` | `npm install && npm run build` |
| Start | `npx prisma migrate deploy && npm run start:prod` | `npx next start -p $PORT` |

The backend reads `PORT`, which these hosts set for you. Deploy the backend first, then set the frontend's `BACKEND_URL` and `NEXT_PUBLIC_API_URL` to its URL (before the frontend builds) and the backend's `SITE_URL` and `CORS_ORIGIN` to the frontend's URL, and redeploy both. Step-by-step guides for Railway and DigitalOcean App Platform: [Deploy on a platform](/deployment/deploy-platforms/).

## Production checklist

- `JWT_SECRET` is a random value of at least 32 characters, and you keep a copy: saved email and storage passwords are encrypted with it (or with `SETTINGS_SECRET`).
- `NODE_ENV=production`, and no `localhost` left in `APP_URL`, `SITE_URL`, `CORS_ORIGIN` or `BACKEND_URL`.
- Uploads are on [S3-compatible storage](/deployment/storage/) or a persistent disk.
- [Email](/deployment/email/) is set up, so password resets and invitations arrive.
- `/api/metrics` is blocked at the proxy or protected with `METRICS_TOKEN`. See [Monitoring](/deployment/monitoring/).
- [Backups](/deployment/backups/) run on a schedule.
- More than one backend instance? Read [Scaling](/deployment/scaling/) first.
