# create-nodepress-app

Scaffold a self-hosted [NodePress](https://nodepress.buildwithkode.com) headless CMS in one command.

```bash
# Local PostgreSQL (default)
npx create-nodepress-app my-project

# Or with Docker (bundles PostgreSQL + Redis + nginx)
npx create-nodepress-app my-project --docker
```

By default the project is scaffolded for a **local PostgreSQL** database — Docker files are left out. Add `--docker` to include `docker-compose.yml`, the `nginx/` + `monitoring/` configs, and the `docker:*` npm scripts.

---

## Before you start — install these first

You need three things installed on your computer before running the command above.

**Already have all three? Skip to [After running the command](#after-running-the-command).**

---

### 1. Node.js 18+

> **Already installed?** Run `node -v` in your terminal. If it shows `v18` or higher, skip to step 2.

Download from [nodejs.org](https://nodejs.org) — install the **LTS** version.

---

### 2. Git

> **Already installed?** Run `git --version` in your terminal. If it shows a version number, skip to step 3.

Download from [git-scm.com/downloads](https://git-scm.com/downloads) — use the default options during install.

---

### 3. PostgreSQL 14+ (only if not using Docker)

> **Have Docker?** Skip PostgreSQL installation — Docker will manage the database for you.

> **Already installed?** Skip to [After running the command](#after-running-the-command). Make sure you remember the password you set for the `postgres` user during install.

Download from [postgresql.org/download](https://www.postgresql.org/download/).

> **Tip:** During installation, you will be asked to set a password for the `postgres` user. Write it down — you'll need it in the next step.

---

## After running the command

The CLI sets up everything automatically (a single `npm install` via npm workspaces installs both backend and frontend). Then follow the path that matches how you scaffolded.

---

### With Docker (`--docker`)

Docker manages the database for you — no password changes required.

```bash
cd my-project
docker-compose up -d             # starts PostgreSQL + Redis
npm run migrate                  # create DB tables
npm run dev                      # backend :3000 + admin panel :5173 (one command)
```

---

### Local PostgreSQL (default)

> **Important:** The CLI generates a random database password that won't match your local PostgreSQL. You must update it before running migrations or you'll get an authentication error.

**Step 1 — Update the database password**

Open `my-project/backend/.env` in any text editor and find:

```
DATABASE_URL="postgresql://postgres:RANDOM_PASSWORD@localhost:5432/nodepress"
```

Replace `RANDOM_PASSWORD` with the password you set when installing PostgreSQL:

```
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress"
```

> **Didn't set a password?** Try: `postgresql://postgres@localhost:5432/nodepress`

**Step 2 — Create the tables and start both servers**

```bash
cd my-project
npm run migrate                  # create DB tables
npm run dev                      # backend :3000 + admin panel :5173 (one command)
```

> Getting an authentication error during migrate? The password in `DATABASE_URL` doesn't match your PostgreSQL password. Double-check Step 1.

Backend runs at `http://localhost:3000` and the admin panel at `http://localhost:5173`.

---

### Create your admin account

Open `http://localhost:5173` in your browser. You will be taken to the setup page automatically. Enter your site name, email, and password.

That's it — NodePress is running!

---

## What the CLI does automatically

1. Downloads NodePress from GitHub into a new folder
2. Removes dev-only files (`.claude`, `cli/`, `docs/`, `.github/`, etc.)
3. Without `--docker`, also removes the Docker files (`docker-compose*.yml`, `nginx/`, `monitoring/`) and the `docker:*` scripts
4. Generates a fresh git repository
5. Creates `backend/.env` and `frontend/.env.local` with random secret keys (plus a root `.env` for Docker Compose when `--docker` is used)
6. Generates a workspace-enabled root `package.json` and runs a single `npm install` (installs backend + frontend together via npm workspaces)

---

## Links

- Full docs: [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com/)
- Website: [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com)
- GitHub: [github.com/buildwithkode/nodepress](https://github.com/buildwithkode/nodepress)
- Issues: [github.com/buildwithkode/nodepress/issues](https://github.com/buildwithkode/nodepress/issues)

## License

Copyright (c) 2026-present BuildWithKode.

NodePress is open source software licensed under the **[MIT License](https://github.com/buildwithkode/nodepress/blob/main/LICENSE)**. You are free to use, modify, and distribute it.
