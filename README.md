# NodePress — Headless CMS for Frontend Developers

> Set up a headless CMS for your client in 10 minutes.
> No Docker. No $99/mo. Just Node.js.

## Why NodePress?

You're a frontend developer. You build in React or Next.js.
Your client needs to update their own content.
You don't want to deal with WordPress.
You can't justify $99/mo for Contentful.
You tried Strapi and spent 4 hours on Docker.

NodePress is the answer.

---

## Option A — One command (recommended)

```bash
npx create-nodepress-app my-project
```

This clones the repo, generates secrets, writes all `.env` files, and installs dependencies automatically.

> Requires Node.js 18+, Git, and PostgreSQL 14+ running locally.

Skip to [step 4](#4-run-database-migrations) after running the above.

---

## Option B — Manual setup

### 1. Prerequisites

Make sure you have the following installed:

- [Node.js 18+](https://nodejs.org)
- [Git](https://git-scm.com)
- [PostgreSQL 14+](https://www.postgresql.org/download/) — running locally on port `5432`

Verify:

```bash
node -v       # should be v18 or higher
git --version
psql --version
```

---

### 2. Clone the repository

```bash
git clone https://github.com/buildwithkode/nodepress.git
cd nodepress
```

---

### 3. Configure environment variables

#### Backend

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and fill in these required values:

```env
DATABASE_URL="postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/nodepress"
JWT_SECRET="any-random-64-character-string"
CORS_ORIGIN="http://localhost:5173"
```

> **PostgreSQL password:** Use the password you set when installing PostgreSQL.
> If you never set one, try `postgres` or leave it blank: `postgresql://postgres@localhost:5432/nodepress`

Generate a JWT secret (run in terminal):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

#### Frontend

```bash
cd ../frontend
cp .env.local.example .env.local
```

The default value works for local development:

```env
BACKEND_URL=http://localhost:3000
```

---

### 4. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

---

### 5. Run database migrations

```bash
cd backend
npx prisma migrate dev
```

This creates all the required tables in your PostgreSQL database.

> If you get an authentication error, double-check the `DATABASE_URL` password in `backend/.env`.

---

### 6. Start the backend

```bash
cd backend
npm run start:dev
```

Backend runs at `http://localhost:3000`
API docs: `http://localhost:3000/api/docs`
Health check: `http://localhost:3000/api/health`

---

### 7. Start the frontend (new terminal)

```bash
cd frontend
npm run dev
```

Admin panel runs at `http://localhost:5173`

---

### 8. First login

Open `http://localhost:5173` — you will be redirected to `/setup`.

Create your admin account (only works once — this is your owner account).

---

## What you get

- Visual content type builder (no code)
- Auto-generated REST API
- Media uploads with image optimization
- API keys with rate limiting
- Forms with submissions
- Webhooks with retry logic
- Audit log and user management
- Scheduled content publishing
- Client-friendly admin panel
- Self-hosted — your data, your server

---

## vs The Alternatives

|                    | NodePress | Strapi   | Contentful |
|--------------------|-----------|----------|------------|
| Setup time         | 10 min    | 2-4 hrs  | 5 min      |
| Docker needed      | No        | Yes      | No         |
| Price              | Free      | Free     | $300/mo    |
| Self-hosted        | Yes       | Yes      | No         |
| Client-friendly UI | Yes       | Mediocre | Yes        |

---

## Tech Stack

NestJS · PostgreSQL · Prisma · Next.js 14 · TypeScript

---

## Cloud version (coming soon)

1-click deploy at [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com)
$45/mo per project — no Docker, no server management, backups included.

---

## License

MIT
