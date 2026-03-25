# create-nodepress-app

Scaffold a self-hosted [NodePress](https://nodepress.buildwithkode.com) headless CMS in one command.

```bash
npx create-nodepress-app my-project
```

## What it does

1. Clones the NodePress repository
2. Removes dev-only files (`.claude`, `cli/`, `scripts/`, etc.)
3. Generates a fresh git repository
4. Creates `backend/.env`, `frontend/.env.local`, and `.env` with random secrets
5. Runs `npm install` in both `backend/` and `frontend/`

## Requirements

- Node.js 18+
- Git
- PostgreSQL 14+ **or** Docker

## Usage

```bash
npx create-nodepress-app <project-name>    # scaffold a new project
npx create-nodepress-app --version         # show version
npx create-nodepress-app --help            # show help
```

## After scaffolding

```bash
cd my-project

# Local development
cd backend
npx prisma migrate dev     # create database tables
npm run start:dev          # backend on http://localhost:3000

# In a new terminal
cd frontend
npm run dev                # admin panel on http://localhost:5173
```

Open `http://localhost:5173` and create your admin account on the `/setup` page.

## Links

- Website: [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com)
- GitHub: [github.com/buildwithkode/nodepress](https://github.com/buildwithkode/nodepress)
- Issues: [github.com/buildwithkode/nodepress/issues](https://github.com/buildwithkode/nodepress/issues)

## License

MIT
