---
title: Deploy on a platform
description: Step by step on Railway and DigitalOcean App Platform (and Render) — two services from your GitHub repository, a managed database, and the settings that connect them.
sidebar:
  order: 0
---

On a platform you don't manage a server: you connect your GitHub repository and the platform builds and runs NodePress for you. Every platform follows the same shape, so read [the shape](#the-shape-every-platform-uses) once, then follow the steps for yours.

**Before you start** you need your NodePress project in a GitHub repository (push the one `npx create-nodepress-app` made, or fork [buildwithkode/nodepress](https://github.com/buildwithkode/nodepress)), and S3-compatible storage for uploads unless your plan has a persistent disk. See [what you need](/deployment/deploy/#what-you-need).

## The shape every platform uses

You create **two services from the same repository** and **one PostgreSQL database**:

| | API service | Admin service |
|---|---|---|
| Folder (root directory) | `backend` | `frontend` |
| Built with | `backend/Dockerfile` (found automatically) | `frontend/Dockerfile` (found automatically) |
| Port | `3000` | `3001` |
| Start command | `sh -c "npx prisma migrate deploy && node dist/main.js"` | the Dockerfile's own |
| Health check | `/api/health` | — |

The start command applies database changes before the API starts, on every deploy.

The two services need each other's address, which you only know after the first deploy. So the order is always: **deploy both → copy their addresses → fill in the variables below → redeploy both.**

**API service variables**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DATABASE_URL` | The database's connection string (each platform has a shortcut, below) |
| `DIRECT_URL` | The same connection string |
| `JWT_SECRET` | A random string of at least 32 characters. Generate one with `openssl rand -hex 32`, or a password manager's generator (64 characters, letters and digits). Keep a copy. |
| `APP_URL` | The **API's** address, such as `https://api.example.com` |
| `SITE_URL` | The **admin's** address, such as `https://cms.example.com` |
| `CORS_ORIGIN` | The **admin's** address again (add your website's address too, comma-separated, if it fetches content from the browser) |

**Admin service variables** — both are read while the admin is **built**, so redeploy (rebuild) the admin after changing them:

| Variable | Value |
|---|---|
| `BACKEND_URL` | The **API's** address |
| `NEXT_PUBLIC_API_URL` | The **API's** address (live updates in the admin) |
| `PORT` | `3001` (Railway only) |

Addresses have no trailing slash and no `/api`.

**Uploads.** A platform's disk is wiped on every deploy. Either attach a persistent volume at `/app/uploads` (where the platform offers one), or use S3-compatible storage: set it up under **Settings → Email & storage** after setup, or with the `STORAGE_*` variables on the API service. See [File storage](/deployment/storage/).

## Railway

1. **Create the project.** At [railway.com](https://railway.com), click **New Project → Deploy from GitHub repo** and pick your repository. Railway creates a service from it; this becomes the API.
2. **Point it at the backend.** Open the service → **Settings** → **Source** → set **Root Directory** to `/backend`. Railway finds the Dockerfile there.
3. **Add the database.** On the project canvas click **+ New** (or **Create**) → **Database** → **PostgreSQL**.
4. **API settings.** In the API service:
   - **Variables:** add the API variables from the table above. For the database use Railway's reference: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` and `DIRECT_URL` = `${{Postgres.DATABASE_URL}}`. Leave `APP_URL`, `SITE_URL` and `CORS_ORIGIN` for step 7.
   - **Settings → Deploy:** set **Custom Start Command** to `sh -c "npx prisma migrate deploy && node dist/main.js"` and **Healthcheck Path** to `/api/health`.
   - **Settings → Networking:** click **Generate Domain** (port `3000`). Copy the address — that's the API's address.
5. **Add the admin.** Click **+ New → GitHub Repo**, pick the same repository, and set its **Root Directory** to `/frontend`. Add its variables: `BACKEND_URL` and `NEXT_PUBLIC_API_URL` = the API's address, `PORT` = `3001`. Under **Networking**, **Generate Domain** (port `3001`) — that's the admin's address.
6. **Uploads.** Add a volume to the API service (right-click it → **Attach Volume**, or **+ New → Volume**) with the mount path `/app/uploads`. Or use S3 storage instead.
7. **Connect them.** On the API service set `APP_URL` to the API's address and `SITE_URL` and `CORS_ORIGIN` to the admin's address. Redeploy the API, then the admin (from each service's **Deployments** tab, **Redeploy**).
8. Open the admin's address + `/setup` and create the admin account.

**Your own domain:** in each service's **Settings → Networking → Custom Domain**, add `cms.example.com` (admin) and `api.example.com` (API), and create the `CNAME` records Railway shows at your DNS provider. Then update the five address variables to the new domains and redeploy both.

## DigitalOcean App Platform

On App Platform, create the API and the admin as **two apps**, so each gets its own address.

**The API app**

1. In the DigitalOcean control panel: **Create → App Platform**, choose **GitHub**, pick your repository and branch, and set **Source directory** to `/backend`. App Platform detects the Dockerfile.
2. Edit the web service: **HTTP port** `3000`, **Run command** `sh -c "npx prisma migrate deploy && node dist/main.js"`, and **Health check** path `/api/health`.
3. **Add the database:** **Add Resource → Database**. A dev database is enough to try it out; for production, create a managed PostgreSQL cluster and attach it. If you named the database component `db`, use `${db.DATABASE_URL}` for both `DATABASE_URL` and `DIRECT_URL`.
4. **Environment variables:** add the API variables from the table above (tick **Encrypt** for `JWT_SECRET`). Leave the three addresses for later.
5. Create the app. When it's live, copy its address (`https://…ondigitalocean.app`) — that's the API's address.

**The admin app**

1. **Create → App Platform** again, same repository, **Source directory** `/frontend`, **HTTP port** `3001`.
2. **Environment variables:** `BACKEND_URL` and `NEXT_PUBLIC_API_URL` = the API's address, with the scope **Build and run time** (they're needed during the build).
3. Create the app and copy its address — the admin's address.

**Connect them:** in the API app's settings set `APP_URL` to the API's address and `SITE_URL` and `CORS_ORIGIN` to the admin's address; it redeploys on save. Then open the admin's address + `/setup`.

**Uploads:** App Platform has no persistent disk, so use **DigitalOcean Spaces** (S3-compatible): see the Spaces example in [File storage](/deployment/storage/#provider-examples).

**Your own domain:** in each app's **Settings → Domains**, add the domain and follow the DNS instructions. Then update the address variables and redeploy (the admin needs a rebuild).

## Render

The repository's **Deploy to Render** button creates everything from `render.yaml`: the database and both services, with the start command and health check filled in. Render asks for the address variables on create; fill them in after the first deploy and redeploy. See [Render](/deployment/self-hosting/#render).

## Other platforms

Fly.io, Koyeb, Northflank, Coolify and similar work the same way: follow [the shape](#the-shape-every-platform-uses) above. Two things trip people up:

- The admin's `BACKEND_URL` and `NEXT_PUBLIC_API_URL` must be available **at build time** (as Docker build arguments). Set at run time only, the admin can't reach the API.
- Upload folders on most platforms are temporary. Use S3-compatible storage or a persistent volume at `/app/uploads`.

## If something goes wrong

| Problem | What to do |
|---|---|
| The API keeps restarting | Open its logs. `JWT_SECRET must be at least 32 characters` or a list of missing variables means a variable is missing or too short. A database error means `DATABASE_URL` is wrong. |
| The admin loads, but signing in fails or pages show errors instead of data | `BACKEND_URL` is wrong or was added after the build. Fix it and **rebuild** the admin. |
| Signing in works but live updates don't | `NEXT_PUBLIC_API_URL` is missing (rebuild after adding it), or `CORS_ORIGIN` on the API doesn't match the admin's address exactly. |
| Images disappear after a deploy | Uploads were on the temporary disk. Attach a volume or switch to S3 storage, and upload them again. |
| Invite and reset links point at the wrong site | `SITE_URL` on the API must be the admin's address. |

When everything works, go through the [go-live checklist](/deployment/deploy/#go-live-checklist).
