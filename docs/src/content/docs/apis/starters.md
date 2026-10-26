---
title: Frontend starters
description: Example websites in Next.js, Astro and Nuxt that read content from NodePress. Copy one to start your site.
sidebar:
  order: 6
---

NodePress is headless: it stores and serves your content, and your website is a separate app. The starters are three small blogs, one per framework, that read a content type through the [JavaScript client](/apis/js-client/). Copy one to get a working site, then change it to fit your content.

They live in the `starters/` folder of every project you create with `create-nodepress-app`, and in the [NodePress repository](https://github.com/buildwithkode/nodepress/tree/main/starters).

| Starter | Framework | Rendering | Extras |
|---|---|---|---|
| `starters/nextjs` | Next.js 15 (App Router) | Server components, published reads cached for 60 s | Draft mode and [live preview](/content/live-preview/) in the entry editor |
| `starters/astro` | Astro 7 | Static build: every page is built at build time | |
| `starters/nuxt` | Nuxt 4 | Server-rendered; NodePress is called from `server/api` | The API key never reaches the browser |

Each starter has:

- a list page, paged with the cursor from `meta.nextCursor` ([cursor pagination](/apis/querying/));
- a post page that renders rich text, sanitized again on the site (NodePress already sanitizes on save);
- cover images resized by NodePress through `cms.imageUrl()`;
- related entries inlined with `?populate=` ([Relations](/content-modeling/relations/)).

## Start a site from a starter

Copy the starter out of the project, point it at your NodePress backend and run it:

```bash
cp -R starters/nextjs ../my-site
cd ../my-site
cp .env.example .env        # Next.js: .env.local
npm install
npm run dev
```

| Starter | Dev server |
|---|---|
| Next.js | http://localhost:3002 |
| Astro | http://localhost:4321 |
| Nuxt | http://localhost:3003 |

The starters ship without lockfiles and depend on the published `@nodepress-cms/client` package, so a copied starter works on its own.

:::tip[Sample content]
Apply the **Blog** [starter template](/content/templates/) in the admin to get a `post` content type with entries, then set `NODEPRESS_TYPE=post`.
:::

## Settings

All three read the same environment variables:

| Variable | Default | What it does |
|---|---|---|
| `NODEPRESS_URL` | `http://localhost:3000` | The NodePress **backend** (the API), not the admin |
| `NODEPRESS_TYPE` | `blog` | The content type to list |
| `NODEPRESS_POPULATE` | `author` | Relation fields to inline, comma-separated (dot paths for nested). Empty for none |
| `NODEPRESS_API_KEY` | | Optional read [API key](/access-control/api-keys/) |
| `NODEPRESS_ADMIN_URL` | `http://localhost:5173` | Next.js only: the admin's origin. Live preview messages from any other origin are ignored |

The Astro starter reads them at build time, so rebuild the site to show new content. The Nuxt starter reads them on its server at runtime; in production, set them as real environment variables.

## Use your own fields

The starters read `title`, `excerpt`, `body` (rich text), `cover` (image) and `author` (relation), and fall back to common alternatives such as `content`, `image` and `name`. For a different schema, edit the one file that maps entry data to what the pages show:

| Starter | File |
|---|---|
| Next.js | `lib/post.ts` |
| Astro | `src/lib/post.ts` |
| Nuxt | `shared/post.ts` |

## Live preview (Next.js)

The Next.js starter shows drafts and updates the page as an editor types:

1. In NodePress, edit the content type and set **Preview URL** to `http://localhost:3002/api/draft?token={token}&slug={slug}&locale={locale}`.
2. Set `NODEPRESS_ADMIN_URL` in the starter to the admin's origin.
3. Open an entry and click **Live** in the editor toolbar.

See [Live preview](/content/live-preview/) for how the preview token, draft mode and the preview messages work, and what a production site needs (HTTPS, no `frame-ancestors` rule that blocks the admin).
