# NodePress starter frontends

Minimal blogs that read a NodePress content type with [`@nodepress-cms/client`](../client). Copy one
out of this folder to start a site.

| Starter | Framework | Rendering | Extras |
|---|---|---|---|
| [`nextjs/`](nextjs) | Next.js 15 (App Router) | server components, 60 s fetch cache | draft mode + live preview in the entry editor |
| [`astro/`](astro) | Astro 7 | static build | every page built at build time |
| [`nuxt/`](nuxt) | Nuxt 4 | server-rendered, CMS calls in `server/api` | API key never reaches the browser |

Each one has a list page with cursor pagination (`meta.nextCursor`), a post page that renders
richtext HTML after sanitizing it again with `sanitize-html` (NodePress already sanitizes on save),
cover images through `cms.imageUrl()` (resized WebP/AVIF from the CMS), and `?populate=author`.

## Quick start

```bash
cp -R starters/nextjs ../my-site && cd ../my-site
cp .env.example .env        # point NODEPRESS_URL at your backend
npm install
npm run dev
```

All starters read the same settings:

| Variable | Default | |
|---|---|---|
| `NODEPRESS_URL` | `http://localhost:3000` | The NodePress **backend** (not the admin) |
| `NODEPRESS_TYPE` | `blog` | Content type to list. The **Blog** starter template creates `post` |
| `NODEPRESS_POPULATE` | `author` | Relation fields to inline, comma-separated; empty for none |
| `NODEPRESS_API_KEY` | — | Optional read key |

Fields are read from `title`, `excerpt`, `body` (richtext), `cover` (image) and `author`
(relation), with common alternatives (`content`, `image`, `name`, …) — edit `post.ts` in the
starter for your own schema.

## `@nodepress-cms/client`

The starters depend on the npm package, `"@nodepress-cms/client": "^1.7.0"`, so a copied starter works
anywhere. To try unreleased client changes, point it at a NodePress checkout instead
(`"file:/path/to/nodepress/client"`, run `npm run build` in `client/` first).

Starters are not npm workspaces of this repo and ship without lockfiles.
