# @nodepress/client

A small, typed client for the [NodePress](https://github.com/buildwithkode/nodepress) public API. No dependencies — it only needs `fetch` (Node 18+, browsers, Deno, Bun, edge runtimes).

```bash
npm install @nodepress/client
npx nodepress generate:types   # optional: TypeScript types for your content types
```

```ts
import { createClient } from '@nodepress/client';
import type { NodePressContentTypes } from './types/nodepress';

const cms = createClient<NodePressContentTypes>({ url: 'https://cms.example.com' });

// List — every REST option is typed: where, sort, search, page/limit, cursor, locale, fallback, populate, fields
const { data, meta } = await cms.collection('blog_post').list({
  where: { featured: { eq: true }, author: { slug: { eq: 'jane' } } }, // relation fields filter on the related entry
  sort: 'createdAt:desc',
  populate: ['author'],
  locale: 'fr',
  fallback: true, // default-language entries where there's no French version
});

// One entry by slug (null when it doesn't exist or isn't published)
const post = await cms.collection('blog_post').get('hello-world', { populate: ['author'] });

// Everything, page by page
for await (const entry of cms.collection('blog_post').all({ limit: 100 })) { /* … */ }

// GraphQL (each content type has typed queries: blogPost / blogPosts)
const res = await cms.graphql(`{ blogPosts(limit: 5) { data { slug data { title } } } }`);

// Images: resized/re-encoded on the fly
const src = cms.imageUrl(post?.data.cover, { w: 800, format: 'auto' });

// Forms
await cms.submitForm('contact', { email: 'me@example.com', message: 'Hi' });
```

## Options

| Option | |
|---|---|
| `url` | The backend, e.g. `https://cms.example.com` (a trailing `/api` is fine) |
| `apiKey` | Sent as `X-API-Key`. Needed for writes and for `stage: 'draft' \| 'staging' \| 'all'`. Keep write keys on the server. |
| `token` | A JWT, sent as `Authorization: Bearer` |
| `locale`, `fallback` | Defaults for every read |
| `environment` | `'staging'` reads the staging environment |
| `headers`, `fetch` | Extra headers; a custom fetch (e.g. Next.js `fetch` with cache options) |

Writes: `collection(type).create({ slug, data, locale })`, `.update(slug, data)`, `.delete(slug)`.

Errors are `NodePressError` with `status` and the response `body`.

## Live preview

When a content type has a **Preview URL** (Content types → edit → *Preview URL*, e.g.
`https://site.example/api/draft?token={token}&slug={slug}&locale={locale}`), the entry editor can
show that page in a side pane. While you type, the editor posts the form's current values to the
frame, and clicking an element in the frame jumps to its field. `{token}` is a 1-hour preview token
(`GET /api/{type}/{slug}/preview?token=…` reads the draft with it); the editor refreshes it before
it expires.

```ts
import { onPreviewUpdate, enableClickToEdit } from '@nodepress/client/preview';

const adminOrigin = 'https://cms.example.com'; // where the NodePress admin runs

// Sends `nodepress:ready`, then calls back on every edit (debounced by the editor).
const stop = onPreviewUpdate((update) => {
  // { type: 'nodepress:preview', contentType, slug, locale, data }
  render(update.data);
}, { adminOrigin });

// <h1 data-np-field="title">…</h1> — outlined on hover; a click focuses "title" in the editor.
const stopClicks = enableClickToEdit({ adminOrigin });
```

- Messages from any origin other than `adminOrigin` (a string or a list; `"*"` is refused) are ignored,
  and both helpers do nothing when the page isn't framed, so they're safe to leave in production code.
- Both return a function that removes their listeners. They are also exported from the package root.
- The editor posts to your page's origin only, so the frame must be on the origin of the Preview URL.
- Your site must allow being framed by the admin: no `X-Frame-Options: DENY`, and a
  `Content-Security-Policy: frame-ancestors` that includes the admin origin if you send one.
