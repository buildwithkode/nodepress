# NodePress + Next.js starter

A minimal blog on Next.js 15 (App Router) reading a NodePress content type, with **draft mode**
and **live preview** in the NodePress entry editor.

```bash
cp .env.example .env.local   # set NODEPRESS_URL, NODEPRESS_TYPE, NODEPRESS_ADMIN_URL
npm install
npm run dev                  # http://localhost:3002
```

- `/` — latest posts, 10 per page, paged with `?cursor=` (`meta.nextCursor`)
- `/posts/[slug]` — one post; richtext sanitized on the server (`lib/sanitize.ts`), cover image via
  `cms.imageUrl()`, relations inlined with `NODEPRESS_POPULATE` (default `author`)
- Published reads are cached for 60 s (`lib/cms.ts`); drafts never are.

## Draft mode and live preview

1. In NodePress, edit the content type and set **Preview URL** to

   ```
   http://localhost:3002/api/draft?token={token}&slug={slug}&locale={locale}
   ```

2. Set `NODEPRESS_ADMIN_URL` to the admin's origin (e.g. `http://localhost:5173`).
3. Open an entry and click **Live** in the editor toolbar.

`/api/draft` checks the 1-hour preview token with `GET /api/{type}/{slug}/preview?token=`, turns on
Next.js draft mode and keeps the token in an HttpOnly cookie, then shows the draft. In draft mode
the post renders through `components/LivePost.tsx`, which uses `@nodepress-cms/client/preview`:

- `onPreviewUpdate()` — re-renders with the editor's unsaved values as you type (only messages from
  `NODEPRESS_ADMIN_URL` are accepted; HTML is sanitized in the browser by `lib/sanitize-dom.ts`)
- `enableClickToEdit()` — elements with `data-np-field="title"` etc. get an outline on hover; a click
  focuses that field in the editor.

`/api/disable-draft` leaves draft mode. In production the editor frames your site from another
site, so the preview cookies are `SameSite=None; Secure` — serve the site over HTTPS, and don't
send `X-Frame-Options: DENY` or a `frame-ancestors` CSP that excludes the admin.

## `@nodepress-cms/client`

`package.json` uses the npm package (`"@nodepress-cms/client": "^1.7.0"`). To try changes from a NodePress
checkout instead, point it at `"file:/path/to/nodepress/client"` and run `npm run build` in `client/` first.
