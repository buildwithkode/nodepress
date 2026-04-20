# NodePress Frontend

Next.js 14 admin panel for the NodePress headless CMS.

> **New to NodePress?** Use the CLI instead: `npx create-nodepress-app my-project`
> Full setup guide: [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com/)

---

## Prerequisites

- Node.js 18+
- NodePress backend running on port `3000` (see `backend/README.md`)

---

## Setup

```bash
cp .env.local.example .env.local
```

Default value works for local development — no changes needed:

```env
BACKEND_URL=http://localhost:3000
```

---

## Install & Run

```bash
npm install
npm run dev      # admin panel at http://localhost:5173
```

---

## First login

On first load you will be redirected to `/setup`.
Create your admin account there — this only works once. After that the setup page is permanently disabled.

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Dev server (port 5173) |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npx tsc --noEmit` | Type-check without building |

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `BACKEND_URL` | Yes | Backend base URL — used by Next.js server components only. Client-side requests go through the `/api` proxy in `next.config.js`. |

> In Docker/production set `BACKEND_URL=http://backend:3000` (internal service name).
