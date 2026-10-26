---
title: Querying
description: Filter, sort, page, search, project and localize REST list responses with query parameters.
sidebar:
  order: 2
---

List endpoints (`GET /api/:type`) take query parameters to filter, sort, page and shape the response. They combine freely, except where noted. The same filters work in [GraphQL](/apis/graphql/) and the [JavaScript client](/apis/js-client/).

```bash
curl -g "http://localhost:3000/api/blog?where[category][eq]=news&sort=createdAt:desc&limit=10"
```

:::tip
`curl` treats `[` and `]` as patterns. Pass `-g` (or `--globoff`), or URL-encode the brackets as `%5B` and `%5D`.
:::

## Parameters

| Parameter | Example | Does |
|---|---|---|
| `where` | `where[price][gte]=10` | Filter on fields ([operators](#operators)) |
| `filters` | `filters[price][$gte]=10` | Same as `where` |
| `sort` | `sort=slug:asc` | Order of results ([sorting](#sorting)) |
| `page`, `limit` | `page=2&limit=50` | Page number and size ([paging](#paging)) |
| `cursor` | `cursor=eyJzIjoi…` | Keyset paging from `meta.nextCursor` |
| `search` | `search=headless cms` | Full-text search ([search](#search)) |
| `fields` | `fields=title,cover` | Only return these data fields |
| `populate` | `populate=author` | Inline related entries |
| `locale`, `fallback` | `locale=fr&fallback=true` | Pick a language ([languages](#languages)) |
| `stage` | `stage=draft` | Include unpublished entries (needs credentials, see [Stages](/apis/rest/#stages-reading-unpublished-content)) |

## Filtering with `where`

The form is `where[field][operator]=value`. `field` is a field key from the content type, or one of the entry's own properties:

```bash
# data fields
GET /api/product?where[price][lt]=50
GET /api/product?where[featured][eq]=true

# the entry's own properties: slug, locale, createdAt, updatedAt, publicId
GET /api/blog?where[slug][startsWith]=2026-
GET /api/blog?where[createdAt][gte]=2026-01-01T00:00:00.000Z
```

Without an operator, `where[field]=value` means equals:

```bash
GET /api/blog?where[category]=news
```

Several conditions are combined with AND.

### Operators

| Operator | Meaning | Example |
|---|---|---|
| `eq` | equals | `where[status_label][eq]=open` |
| `ne` | not equal | `where[category][ne]=archive` |
| `gt`, `gte` | greater than (or equal) | `where[price][gte]=10` |
| `lt`, `lte` | less than (or equal) | `where[price][lt]=100` |
| `in` | any of a comma-separated list | `where[category][in]=news,guides` |
| `notIn` | none of the list | `where[category][notIn]=draft,internal` |
| `contains` | text contains | `where[title][contains]=Node` |
| `startsWith` | text starts with | `where[title][startsWith]=How` |
| `endsWith` | text ends with | `where[title][endsWith]=guide` |

Operators may be written with a `$` prefix (`$eq`, `$gte`, `$in`), Strapi style, and `filters[...]` is accepted as an alias of `where[...]`.

How values are read:

- `true` and `false` become booleans.
- Numbers such as `10` or `4.5` become numbers. A value with leading zeros, like `007`, stays text.
- Everything else is text.

Good to know:

- `contains`, `startsWith` and `endsWith` are case-sensitive on data fields and case-insensitive on `slug` and `locale`.
- `where` filters top-level fields. Values inside a group, repeater or flexible field can't be filtered, except through a relation (below).
- An unknown operator is treated as `eq`.
- To filter a field often on a large content type, mark it **indexed**. See [Indexed fields](/content-modeling/fields/#indexed-fields).

### OR and AND

Group conditions with `OR` and `AND`, each clause numbered:

```bash
# category is news OR the post is featured
GET /api/blog?where[OR][0][category][eq]=news&where[OR][1][featured][eq]=true

# price between 10 and 50, and (in stock OR preorder)
GET /api/product?where[price][gte]=10&where[price][lte]=50&where[OR][0][stock][gt]=0&where[OR][1][preorder][eq]=true
```

A clause can hold several conditions; they are combined with AND inside the clause.

### Filtering by related entries

On a relation field, `where` can filter on the related entry's fields, one level deep:

```bash
GET /api/post?where[author][slug][eq]=jane-doe
GET /api/post?where[author.name][eq]=Jane%20Doe
```

This matches at most 1,000 related entries. See [Filtering by related fields](/content-modeling/relations/#filtering-by-related-fields).

### Legacy `filter`

`filter[field]=value` is an older form that matches entries whose field *contains* the value as text:

```bash
GET /api/blog?filter[title]=hello
```

Prefer `where`, which has operators and exact matching.

## Sorting

`sort=field:direction`:

| `sort` | Order |
|---|---|
| `createdAt:desc` | newest first (default) |
| `createdAt:asc` | oldest first |
| `updatedAt:desc` / `updatedAt:asc` | by last change |
| `slug:asc` / `slug:desc` | alphabetical by slug |

Only `createdAt`, `updatedAt` and `slug` can be sorted on. Any other field falls back to `createdAt`, and any direction other than `asc` means `desc`.

## Paging

### By page

```bash
GET /api/blog?page=2&limit=50
```

`limit` is 1 to 100 (default 20). Values outside that range are clamped. `meta` tells you where you are:

```json
{ "total": 132, "page": 2, "limit": 50, "totalPages": 3, "nextCursor": "eyJzIjoiY3JlYXRlZEF0OmRlc2MiLC…" }
```

### By cursor

Deep pages get slower with `page`, because the database counts and skips every earlier row. A cursor continues from the last entry of the previous page and stays fast at any depth:

```bash
GET /api/blog?limit=100
# → meta.nextCursor = "eyJzIjoi…"
GET /api/blog?limit=100&cursor=eyJzIjoi…
```

Every list response includes `meta.nextCursor`, `null` on the last page. In cursor mode `meta` is only `{ limit, nextCursor }`: there is no total, which is what makes it fast.

- Keep the same `sort` for every page. A cursor used with a different sort returns `400`.
- Keep the same filters too; the cursor only remembers the position.
- A cursor can't be combined with `search`. Page search results with `page` instead.

## Search

`search` runs a full-text search over the slug and every field value:

```bash
GET /api/blog?search=headless cms
```

```json
{
  "data": [ … ],
  "meta": { "total": 4, "page": 1, "limit": 20, "totalPages": 1, "searchMode": "fulltext" }
}
```

`meta.searchMode` tells you how the search ran:

| `searchMode` | Meaning |
|---|---|
| `fulltext` | PostgreSQL full-text index (English word forms: "posts" matches "post") |
| `fallback` | A plain text match, used when the term can't be read as a full-text query |
| `meilisearch` | An external Meilisearch engine is configured. See [Search](/deployment/search/) |

The full-text query accepts web-search syntax: `"exact phrase"`, `-excluded`, `this OR that`.

:::caution[Search ignores other filters]
A search returns published entries, newest first. `where`, `filter`, `sort` and `stage` are not applied to search results. Use `locale`, `page` and `limit` with it.
:::

## Choosing fields

`fields` limits `data` to the listed keys. The entry's own properties (`id`, `slug`, `locale`, `seo`, dates) are always returned:

```bash
GET /api/blog?fields=title,cover
```

```json
{ "id": "8c0f…", "slug": "hello-world", "locale": "en", "data": { "title": "Hello world", "cover": { "url": "…", "alt": "" } }, "…": "…" }
```

`fields` works on single entries too: `GET /api/blog/hello-world?fields=title`.

## Related entries

`populate` replaces relation IDs with the related entries, with dot paths for deeper levels:

```bash
GET /api/post?populate=author,categories
GET /api/post/my-post?populate=author,author.company
```

See [Relations](/content-modeling/relations/#resolving-with-populate) for depth limits and what's included.

Responses with `fields` or `populate` aren't cached, so use them where they save real work.

## Languages

On a site with several [content languages](/content/languages/):

| Request | Returns |
|---|---|
| `GET /api/blog` | entries in every language |
| `GET /api/blog?locale=fr` | French entries only |
| `GET /api/blog?locale=fr&fallback=true` | French entries, plus default-language entries that have no French translation |
| `GET /api/blog/hello` | the default-language entry |
| `GET /api/blog/hello?locale=fr` | the French translation, or `404` |
| `GET /api/blog/hello?locale=fr&fallback=true` | the French translation, or the default-language one when there isn't any |

Each entry's `locale` says which language you got. A single-entry response also sets the `Content-Language` header to it.

## Single entries

`GET /api/:type/:slug` takes `locale`, `fallback`, `stage`, `fields` and `populate`. Filters, sorting and paging only apply to lists.
