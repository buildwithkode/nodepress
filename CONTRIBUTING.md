# Contributing to NodePress

Thank you for considering a contribution! NodePress is open source and community contributions are what make it better.

---

## Ways to contribute

- **Report a bug** — [Open a bug report](https://github.com/buildwithkode/nodepress/issues/new?template=bug_report.md)
- **Request a feature** — [Open a feature request](https://github.com/buildwithkode/nodepress/issues/new?template=feature_request.md)
- **Fix a bug** — pick any issue labelled `good first issue` or `bug`
- **Write docs** — improve the `/docs` page or this repo's markdown files
- **Submit a PR** — see the workflow below

---

## Local development setup

### Prerequisites

- Node.js 18+
- Git
- PostgreSQL 14+

### 1. Fork and clone

```bash
git clone https://github.com/YOUR_USERNAME/nodepress.git
cd nodepress
```

### 2. Set up the backend

```bash
cd backend
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, CORS_ORIGIN
npm install
npx prisma migrate dev
npm run start:dev
```

### 3. Set up the frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Visit `http://localhost:5173` → create your admin account.

---

## Project structure

```
backend/   NestJS API (port 3000)
frontend/  Next.js admin panel + public routes (port 5173)
cli/       create-nodepress-app scaffolding CLI
docs/      Static documentation site
```

See [CLAUDE.md](./CLAUDE.md) for a detailed architecture reference.

---

## Making changes

### Branch naming

```
feat/your-feature-name
fix/issue-description
docs/what-you-updated
```

### Code style

- TypeScript throughout — no `any` unless unavoidable
- Backend: NestJS conventions (services, controllers, DTOs, guards)
- Frontend: Next.js App Router conventions (server components where possible)
- No new dependencies without discussion in an issue first

### Adding a new backend module

1. Create `src/your-module/` with `your-module.module.ts`, `your-module.service.ts`, `your-module.controller.ts`
2. Add DTOs with `class-validator` decorators
3. Import the module in `app.module.ts` (before `DynamicApiModule` — it must stay last)
4. Add a Prisma migration if the schema changes: `npx prisma migrate dev --name describe-change`

### Adding a new field type

1. Add the type to the schema validator in `backend/src/content-type/`
2. Add a renderer in `frontend/app/(admin)/entries/DynamicFormField.tsx`
3. Update the Field Types table in `frontend/app/(docs)/docs/page.tsx`

### Database migrations

- Never edit existing migration files — create a new one
- Migration files are committed to the repo so existing users can upgrade cleanly

---

## Pull request checklist

- [ ] `npx tsc --noEmit` passes in both `backend/` and `frontend/`
- [ ] No regressions in existing features
- [ ] If you added a new feature, the `/docs` page is updated
- [ ] If you changed the DB schema, a migration file is included
- [ ] PR description explains what and why (not just what)

---

## Commit message style

```
feat: add flexible field type
fix: prevent duplicate webhook delivery on retry
docs: update API key permissions table
chore: bump sharp to 0.33
```

---

## Questions?

Open a [GitHub Discussion](https://github.com/buildwithkode/nodepress/discussions) or file an issue.
