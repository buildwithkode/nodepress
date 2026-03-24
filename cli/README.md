# NodePress CLI

Scaffold a self-hosted [NodePress](https://gitlab.com/leo9karthik/nodepress) headless CMS project in one command.

```bash
npx nodepress new my-cms
```

## What it does

- Clones the NodePress repository into a new folder
- Generates cryptographically random `JWT_SECRET` and database password
- Writes `backend/.env`, `frontend/.env.local`, and `.env` (Docker) with all values filled in
- Runs `npm install` in both `backend/` and `frontend/`

## Requirements

- Node.js 18+
- Git
- PostgreSQL 14+ **or** Docker

## Usage

```bash
npx nodepress new <project-name>
npx nodepress --version
npx nodepress --help
```

## Quick start

```bash
npx nodepress new my-cms
cd my-cms

# Option A — Docker (recommended)
docker-compose -f docker-compose.prod.yml up -d

# Option B — Local development
cd backend && npx prisma migrate dev && npm run start:dev
# In a second terminal:
cd frontend && npm run dev
```

- Admin panel: `http://localhost:5173`
- API: `http://localhost:3000/api`
- API docs: `http://localhost:3000/api/docs`

On first load the admin panel redirects to `/setup` where you create the first admin account.

## License

MIT
