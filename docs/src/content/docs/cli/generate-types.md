---
title: Generate types
description: Generate TypeScript interfaces for your content types with create-nodepress-app generate:types and use them with the JavaScript client.
sidebar:
  order: 4
---

`generate:types` writes a TypeScript declaration file with one interface per content type, so your site's code knows the shape of every entry. Run it again whenever you change a content type.

```bash
npx create-nodepress-app generate:types
npx create-nodepress-app generate:types --out src/types/nodepress.d.ts
```

## Where it reads from

The command reads the content types straight from the database, through the backend's Prisma client. Run it in your NodePress project's root folder, after `npm install`, with `DATABASE_URL` set. It loads `DATABASE_URL` from `backend/.env` (or `.env` in the current folder) when it isn't already in the environment.

If it can't reach the database, it still writes the file, with the base types only and no content types. Check the summary line it prints:

```text
  ✓  TypeScript definitions written to: frontend/types/nodepress.d.ts (4 content types)
```

:::note[Generating types in a separate site repository]
The command doesn't fetch types over HTTP. To use them in a site that lives in another repository, generate the file in the NodePress project and copy it over, or commit it somewhere both can reach.
:::

## Options

| Option | Default |
|---|---|
| `--out <path>`, `-o <path>` | `frontend/types/nodepress.d.ts` when the current folder has a `frontend/` folder, otherwise `types/nodepress.d.ts`. Missing folders are created. |

The file is overwritten on every run. Don't edit it by hand.

## What it generates

For a content type `blog_post` with a required `title`, a `cover` image, a `tags` select with fixed choices and an `author` relation:

```ts title="frontend/types/nodepress.d.ts"
/** Data payload for "blog_post" (blog_post) */
export interface BlogPostData {
  title: string;
  cover?: { url: string; alt?: string };
  tags?: ("news" | "guides")[];
  author?: string;
}

/** Full entry wrapper for "blog_post" */
export type BlogPostEntry = BaseEntry<BlogPostData>;

export interface NodePressContentTypes {
  "blog_post": BlogPostEntry;
}

export type NodePressContentType = keyof NodePressContentTypes;
export type AnyNodePressEntry = NodePressContentTypes[NodePressContentType];
```

| Export | What it is |
|---|---|
| `<Name>Data` | The entry's `data` object. The name is the content type name in PascalCase: `blog_post` → `BlogPostData`. |
| `<Name>Entry` | A full entry: `BaseEntry<<Name>Data>`. |
| `BaseEntry<TData>` | The entry envelope: `id` (public UUID), `slug`, `locale`, `status`, `createdAt`, `updatedAt`, `seo`, `data`. |
| `NodePressSEO` | The `seo` object: `title`, `description`, `ogImage`, `canonical`, `noIndex`. |
| `PaginatedResponse<T>` | A list response: `data` plus `meta` (`total`, `page`, `limit`, `totalPages`). |
| `NodePressContentTypes` | Maps each content type name to its entry type. Pass it to the JavaScript client. |
| `NodePressContentType`, `AnyNodePressEntry` | The union of content type names, and of entry types. |

A field is optional (`?`) unless it's marked **Required**. A field's `description` becomes a doc comment.

### Field types

| Field type | TypeScript type |
|---|---|
| `text`, `textarea`, `richtext`, `color`, `date`, `datetime` | `string` |
| `number` | `number` |
| `boolean` | `boolean` |
| `select` | A union of its choices, e.g. `"news" \| "guides"`, or `string` without choices. An array of them when `multiple` is on. |
| `image` | `{ url: string; alt?: string }` |
| `relation` | `string` (the related entry's public ID), or `string[]` for `many` |
| Reverse relation (`mappedBy`) | `BaseEntry \| null`, or `Array<BaseEntry>` for `many`. Always optional, since it's only present with `?populate=`. |
| `json` | `Record<string, any>` |
| `group` | An object type with its sub-fields |
| `repeater` | `Array<{ …sub-fields; _id?: string }>` |
| `flexible` | An array of a union with one member per layout, each with `_layout: "<layout name>"` and that layout's fields |

Groups, repeaters and flexible fields are typed all the way down, at every [nesting level](/content-modeling/nested-fields/). A relation is typed as the ID it stores; when you resolve it with [`?populate=`](/content-modeling/relations/#resolving-with-populate), the value is the related entry instead, so cast it where you populate.

## Using the types

Pass `NodePressContentTypes` to the JavaScript client, and `collection()` returns typed entries:

```ts
import { createClient } from '@nodepress-cms/client';
import type { NodePressContentTypes } from './types/nodepress';

const cms = createClient<NodePressContentTypes>({ url: 'https://cms.example.com' });

const post = await cms.collection('blog_post').get('hello-world');
post?.data.title; // string
```

See [JavaScript client](/apis/js-client/) for the rest of the client.

To keep the file current, add a script and run it after schema changes:

```json title="package.json"
{
  "scripts": {
    "types": "npx -y create-nodepress-app generate:types"
  }
}
```
