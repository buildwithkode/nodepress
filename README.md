# NodePress — Headless CMS for Frontend Developers

> Set up a headless CMS for your client in 10 minutes.
> No Docker. No $99/mo. Just Node.js.

<!-- Add screenshot: ![NodePress Admin](./assets/screenshot.png) -->

## Why NodePress?

You're a frontend developer. You build in React or Next.js.
Your client needs to update their own content.
You don't want to deal with WordPress.
You can't justify $99/mo for Contentful.
You tried Strapi and spent 4 hours on Docker.

NodePress is the answer.

## Install in 4 steps

```bash
git clone https://github.com/buildwithkode/nodepress
cd nodepress/backend && npm install
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
npm run start:dev
```

Done. Open http://localhost:3000/api/docs

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

## vs The Alternatives

|                | NodePress | Strapi   | Contentful |
|----------------|-----------|----------|------------|
| Setup time     | 10 min    | 2-4 hrs  | 5 min      |
| Docker needed  | No        | Yes      | No         |
| Price          | Free      | Free     | $300/mo    |
| Self-hosted    | Yes       | Yes      | No         |
| Client-friendly UI | Yes   | Mediocre | Yes        |

## Cloud version (coming soon)

1-click deploy at [nodepress.buildwithkode.com](https://nodepress.buildwithkode.com)
$29/mo per project — no Docker, no server management, backups included.

## Tech Stack

NestJS · PostgreSQL · Prisma · Next.js 14 · TypeScript

## License

MIT
