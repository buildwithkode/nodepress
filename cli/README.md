# create-nodepress-app

Scaffold a self-hosted [NodePress](https://nodepress.buildwithkode.com) headless CMS in one command.

```bash
npx create-nodepress-app my-project
```

---

## Before you start — install these first

You need three things installed on your computer before running the command above:

| What | Why | Download |
|---|---|---|
| **Node.js 18+** | Runs NodePress | [nodejs.org](https://nodejs.org) |
| **Git** | Downloads the source code | [git-scm.com](https://git-scm.com/downloads) |
| **PostgreSQL 14+** | The database that stores your content | [postgresql.org](https://www.postgresql.org/download/) |

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

MIT
