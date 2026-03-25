# create-nodepress-app

Scaffold a self-hosted [NodePress](https://nodepress.buildwithkode.com) headless CMS project in one command.

```bash
npx create-nodepress-app my-cms
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
npx create-nodepress-app <project-name>
npx create-nodepress-app --version
npx create-nodepress-app --help
```

## Quick start

```bash
npx create-nodepress-app my-cms
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

## Links

- Website: [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com)
- GitHub: [github.com/buildwithkode/nodepress](https://github.com/buildwithkode/nodepress)

## License

MIT
