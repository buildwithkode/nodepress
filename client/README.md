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
