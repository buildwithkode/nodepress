---
title: JavaScript client
description: Read and write NodePress content from JavaScript or TypeScript with @nodepress-cms/client, typed from your content types.
sidebar:
  order: 5
---

`@nodepress-cms/client` is a small, typed client for the NodePress API. It has no dependencies and only needs `fetch`, so it runs in Node 18+, browsers, Deno, Bun and edge runtimes. It builds the query strings for you, including nested `where` filters, and gives you typed entries when you generate types from your content types.

## Install

```bash
npm install @nodepress-cms/client
```

## Create a client

```ts
import { createClient } from '@nodepress-cms/client';

const cms = createClient({ url: 'https://cms.example.com' });
```

| Option | Meaning |
|---|---|
| `url` | The backend, e.g. `https://cms.example.com`. Required. A trailing `/api` is fine. |
| `apiKey` | Sent as `X-API-Key`. Needed for writes and for unpublished stages. |
| `token` | A JWT, sent as `Authorization: Bearer …` |
| `locale` | Default language for every read |
| `fallback` | Default for `fallback` on every read |
| `environment` | `'staging'` reads the staging environment (`X-NodePress-Environment`); needs credentials |
| `headers` | Extra headers for every request |
| `fetch` | A custom `fetch`, e.g. one with Next.js cache options, or a mock in tests |

:::caution
Anything you pass to the client in browser code is public. Only use `apiKey` with a write or `all` key in server code. Published content needs no key.
:::

## Read entries

`collection(type)` gives you the entries of one content type:

```ts
const posts = cms.collection('blog_post');

// GET /api/blog_post
const { data, meta } = await posts.list({
  where: { featured: { eq: true }, author: { slug: { eq: 'jane' } } },
  sort: 'createdAt:desc',
  limit: 10,
  populate: ['author'],
});

// GET /api/blog_post/hello-world, or null when there's no published entry
const post = await posts.get('hello-world', { populate: ['author'] });
```

`list()` takes every option of the REST list endpoint:

| Option | Example |
|---|---|
| `where` | `{ price: { gte: 10 }, OR: [{ category: { eq: 'news' } }, { featured: { eq: true } }] }` |
| `sort` | `'slug:asc'` |
| `search` | `'headless cms'` |
| `page`, `limit` | `2`, `50` |
| `cursor` | `meta.nextCursor` from the previous page |
| `fields` | `['title', 'cover']` |
| `populate` | `['author', 'author.company']` |
| `locale`, `fallback` | `'fr'`, `true` |
| `stage` | `'draft'` (needs `apiKey` or `token`) |

`get(slug, options)` takes `locale`, `fallback`, `populate`, `fields` and `stage`. See [Querying](/apis/querying/) for what each one does.

`in` and `notIn` take arrays: `{ category: { in: ['news', 'guides'] } }`. On a relation field, a nested object filters on the related entry's fields, as in `author: { slug: { eq: 'jane' } }`.

### Every entry

`all()` walks through every matching entry, page by page, using cursor paging (page paging when you pass `search`):

```ts
for await (const post of cms.collection('blog_post').all({ where: { featured: { eq: true } } })) {
  console.log(post.slug);
}
```

It fetches 100 entries per request unless you pass `limit`.

## Types from your content types

Generate TypeScript types for your content types, then pass them to `createClient`:

```bash
npx create-nodepress-app generate:types
```

```ts
import { createClient } from '@nodepress-cms/client';
import type { NodePressContentTypes } from './types/nodepress';

const cms = createClient<NodePressContentTypes>({ url: 'https://cms.example.com' });

const post = await cms.collection('blog_post').get('hello-world');
post?.data.title;        // string
cms.collection('typo');  // type error: not a content type
```

Content type names, `data` fields, `where` keys and `create`/`update` payloads are then type-checked. Run the command again after changing a content type. See [generate:types](/cli/generate-types/) for where the file is written and its options.

## Write entries

Writes need an `apiKey` with `write` or `all` access, or a `token`:

```ts
const cms = createClient({ url: process.env.CMS_URL!, apiKey: process.env.CMS_WRITE_KEY });
const posts = cms.collection('blog_post');

// POST /api/blog_post (published unless status is 'draft')
await posts.create({ slug: 'from-the-client', status: 'draft', data: { title: 'Hello' } });

// PUT /api/blog_post/from-the-client
await posts.update('from-the-client', { title: 'Hello again', body: '<p>…</p>' });

// DELETE /api/blog_post/from-the-client (moves it to the trash)
await posts.delete('from-the-client');
```

`create` takes `slug`, `data` and optionally `locale` and `status`. `update` and `delete` take `{ locale }` as their last argument.

:::note
`update` changes only the fields you pass; send `null` to clear one. Before NodePress 1.7.2 it replaced the whole `data`. See [Writing entries](/apis/rest/#writing-entries).
:::

## Images

`imageUrl()` builds a resized, re-encoded URL for an uploaded image through the media transform endpoint:

```ts
const src = cms.imageUrl(post?.data.cover, { w: 800, format: 'auto' });
// https://cms.example.com/api/media/1730000000000-3f2a9c1e.jpg/transform?w=800&format=auto
```

It accepts an image field value (`{ url, alt }`) or a URL string. Options: `w`, `h`, `q`, `fit` (`cover`, `contain`, `fill`, `inside`, `outside`) and `format` (`auto`, `webp`, `avif`, `jpeg`, `png`). URLs that don't point at `/uploads/`, such as images served from an S3 bucket, come back unchanged. See [Media](/content/media/) for how sizes are rounded and cached.

## GraphQL

```ts
const data = await cms.graphql<{ blogPosts: { data: { slug: string }[] } }>(
  `query($limit: Int) { blogPosts(limit: $limit) { data { slug } } }`,
  { limit: 5 },
);
```

`graphql()` posts to `/graphql` and returns `data`. It throws when the response has errors. See [GraphQL](/apis/graphql/).

## Other helpers

| Method | Calls | Returns |
|---|---|---|
| `cms.locales()` | `GET /api/locales` | `{ locales, defaultLocale }` |
| `cms.submitForm(slug, data, { captchaToken })` | `POST /api/submit/:slug` | the submission result. See [Forms](/content/forms/) |

## Errors

A response other than 2xx throws a `NodePressError` with the HTTP `status` and the parsed response `body`:

```ts
import { NodePressError } from '@nodepress-cms/client';

try {
  await cms.collection('blog_post').create({ slug: 'hello', data: {} });
} catch (err) {
  if (err instanceof NodePressError && err.status === 422) {
    console.log((err.body as { errors: string[] }).errors);
  }
}
```

`get()` is the exception: a `404` returns `null` instead of throwing.

## Next.js

Pass Next.js caching options through a custom `fetch`:

```ts
const cms = createClient({
  url: process.env.CMS_URL!,
  fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 60 } }),
});
```

For a complete Next.js, Astro or Nuxt site built on the client, start from a [frontend starter](/apis/starters/).

## Live preview

The client also ships the helpers your site needs to show live edits in the entry editor's preview pane:

```ts
import { onPreviewUpdate, enableClickToEdit } from '@nodepress-cms/client/preview';

onPreviewUpdate((update) => render(update.data), { adminOrigin: 'https://cms.example.com' });
enableClickToEdit({ adminOrigin: 'https://cms.example.com' });
```

They're also exported from the package root, with `isInPreviewFrame()`. See [Live preview](/content/live-preview/) for the setup.
