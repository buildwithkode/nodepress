# NodePress + Nuxt starter

A minimal server-rendered blog on Nuxt 4 reading a NodePress content type.

```bash
cp .env.example .env   # set NODEPRESS_URL and NODEPRESS_TYPE
npm install
npm run dev            # http://localhost:3003
npm run build && node --env-file=.env .output/server/index.mjs
```

The pages never call NodePress directly: `server/api/posts.get.ts` and
`server/api/posts/[slug].get.ts` do, with the settings from the environment (read at runtime, so
`NODEPRESS_API_KEY` stays on the server), and return just what the pages show.

- `/` — 10 posts per page, paged with `?cursor=` (`meta.nextCursor`)
- `/posts/[slug]` — one post; richtext sanitized on the server with `sanitize-html`
  (`server/utils/sanitize.ts`), cover via `cms.imageUrl()`, relations inlined with
  `NODEPRESS_POPULATE` (default `author`)
- Field mapping lives in `shared/post.ts`.

## `@nodepress-cms/client`

`package.json` uses the npm package (`"@nodepress-cms/client": "^1.7.0"`). To try changes from a NodePress
checkout instead, point it at `"file:/path/to/nodepress/client"` and run `npm run build` in `client/` first.
