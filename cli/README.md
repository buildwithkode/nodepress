# create-nodepress-app

Scaffold a self-hosted [NodePress](https://nodepress.buildwithkode.com) headless CMS in one command.

```bash
npx create-nodepress-app my-project
```

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

### 3. PostgreSQL 14+

> **Already installed?** Skip to [After running the command](#after-running-the-command). Just make sure you remember the password you set for the `postgres` user during install.

Download from [postgresql.org/download](https://www.postgresql.org/download/).

> **PostgreSQL tip:** During installation, you will be asked to set a password for the `postgres` user. Write it down — you'll need it in step 2 below.

---

## After running the command

The CLI sets up everything automatically. Then follow these steps:

### Step 1 — Update the database password

Open `my-project/backend/.env` in any text editor and find:

```
DATABASE_URL="postgresql://postgres:RANDOM_PASSWORD@localhost:5432/nodepress"
```

Replace `RANDOM_PASSWORD` with the password you set when installing PostgreSQL:

```
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress"
```

> **Didn't set a password?** Try: `postgresql://postgres@localhost:5432/nodepress`

### Step 2 — Create the database tables

```bash
cd my-project/backend
npx prisma migrate dev
```

> Getting an authentication error? The password in `DATABASE_URL` doesn't match your PostgreSQL password. Double-check step 1.

### Step 3 — Start the backend

```bash
cd my-project/backend
npm run start:dev
```

Backend runs at `http://localhost:3000`. Keep this terminal open.

### Step 4 — Start the admin panel

Open a **new terminal** and run:

```bash
cd my-project/frontend
npm run dev
```

Admin panel runs at `http://localhost:5173`. Keep this terminal open too.

### Step 5 — Create your admin account

Open `http://localhost:5173` in your browser. You will be taken to the setup page automatically. Enter your site name, email, and password.

That's it — NodePress is running!

---

## What the CLI does automatically

1. Downloads NodePress from GitHub into a new folder
2. Removes dev-only files (`.claude`, `cli/`, `scripts/`, etc.)
3. Generates a fresh git repository
4. Creates `backend/.env` and `frontend/.env.local` with random secret keys
5. Runs `npm install` in both backend and frontend

---

## Links

- Full docs: [buildwithkode.github.io/nodepress](https://buildwithkode.github.io/nodepress/)
- Website: [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com)
- GitHub: [github.com/buildwithkode/nodepress](https://github.com/buildwithkode/nodepress)
- Issues: [github.com/buildwithkode/nodepress/issues](https://github.com/buildwithkode/nodepress/issues)

## License

Copyright (c) 2026-present Karthik Paulraj / BuildWithKode. All Rights Reserved.

NodePress is proprietary software. Source code is available for self-hosted use only.
You may not copy, redistribute, sell, or claim this software as your own without written permission.

See the [full license](https://github.com/buildwithkode/nodepress/blob/main/LICENSE) for details.
