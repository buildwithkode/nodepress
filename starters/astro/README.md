# NodePress + Astro starter

A minimal static blog on Astro 7 reading a NodePress content type.

```bash
cp .env.example .env   # set NODEPRESS_URL and NODEPRESS_TYPE
npm install
npm run dev            # http://localhost:4321
npm run build          # static site in dist/
```

- `/`, `/page/2`, … — 10 posts per page. At build time `src/lib/cms.ts` walks the whole list with
  cursor paging (`meta.nextCursor`) once and every page is generated from it.
- `/posts/[slug]` — one page per published post, built from the same list responses (relations
  inlined with `NODEPRESS_POPULATE`, default `author`). Richtext is sanitized with `sanitize-html`
  (`src/lib/sanitize.ts`); images go through `cms.imageUrl()`.
- If NodePress can't be reached the build still succeeds, with an empty blog and the error on the
  home page.

Content changes need a rebuild: add a NodePress webhook on entry publish/update
that calls your host's deploy hook. For drafts and live preview, see the Next.js starter — a static
site has no server to unlock drafts with a preview token.

## `@nodepress-cms/client`

`package.json` uses the npm package (`"@nodepress-cms/client": "^1.7.0"`). To try changes from a NodePress
checkout instead, point it at `"file:/path/to/nodepress/client"` and run `npm run build` in `client/` first.
