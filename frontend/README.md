# NodePress Frontend

Next.js 14 admin panel for the NodePress headless CMS.

## Requirements

- Node.js 18+
- NodePress backend running on port `3000`

## Setup

```bash
cp .env.local.example .env.local
```

Default value works for local development — no changes needed:

```env
BACKEND_URL=http://localhost:3000
```

## Install & run

```bash
npm install
npm run dev      # dev server on http://localhost:5173
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Dev server (port 5173) |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npx tsc --noEmit` | Type-check without building |

## First login

On first load you will be redirected to `/setup`.
Create your admin account there — this only works once.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `BACKEND_URL` | Yes | Backend base URL — used by server components only. Client-side requests go through the `/api` proxy. |

## How API calls work

- **Server components** use `BACKEND_URL` directly (set in `.env.local`)
- **Client-side** requests go through the Next.js proxy: `/api/*` → `http://localhost:3000/api/*`

In Docker/production the proxy is not used — set `BACKEND_URL` to the internal service URL (e.g. `http://backend:3000`).
