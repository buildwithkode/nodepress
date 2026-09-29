# NodePress Frontend

Next.js 14 admin panel for the NodePress headless CMS.

> **New to NodePress?** Use the CLI instead: `npx create-nodepress-app my-project`
> Full setup guide: [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com/)

---

## Prerequisites

- Node.js 18+
- NodePress backend running on port `3001` (or `3000`, see `backend/README.md`)

---

## Setup

```bash
cp .env.local.example .env.local
```

Default value for local development:

```env
BACKEND_URL=http://localhost:3001
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

## API Authentication & Integration (Do I need a token?)

### 1. Consumer Frontends (Reading Content & Submitting Forms)
**No token required!** Public visitor frontends (Next.js App Router, React, Vue, Astro, mobile apps) require zero authentication headers or tokens:
```typescript
// Query published content — zero headers required!
const res = await fetch('http://localhost:3001/api/posts?status=published');
const { data: posts } = await res.json();
```
Or import pre-built SDK helpers from `@/lib/nodepress`:
```typescript
import { fetchEntries, fetchEntry } from '@/lib/nodepress';
const { data: articles } = await fetchEntries({ type: 'blog' });
```

### 2. External Headless / Jamstack Builds (API Key)
For static site generation (SSG) or CI/CD pipelines needing scoped access:
```typescript
fetch('http://localhost:3001/api/entries?contentTypeId=articles', {
  headers: { 'X-API-Key': process.env.NODEPRESS_API_KEY },
});
```

### 3. Admin Panel (JWT Bearer + Silent Refresh)
When running the NodePress admin panel, client-side requests go through the `/api` rewrite proxy. On login, the backend issues a 7-day JWT access token (`np_token`) and a 30-day `HttpOnly` refresh cookie (`np_refresh`). The Axios client automatically handles 401 transparent refreshes.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `BACKEND_URL` | Yes | Backend base URL (default: `http://localhost:3001`) — used by Next.js server components only. Client-side requests go through the `/api` proxy in `next.config.js`. |

> In Docker/production set `BACKEND_URL=http://backend:3001` (or your internal service port).
