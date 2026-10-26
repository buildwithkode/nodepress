---
title: REST API
description: The REST endpoints NodePress generates for every content type, how to authenticate, read unpublished stages, write entries, and handle errors, rate limits and caching.
sidebar:
  order: 1
---

Every content type gets REST endpoints as soon as you save it. Published entries can be read without credentials. Writes and unpublished content need an API key or a signed-in user's token. This page covers the endpoints, authentication, errors and caching. [Querying](/apis/querying/) covers filters, sorting and paging.

## Base URL

All REST endpoints live under `/api` on the backend:

```text
http://localhost:3000/api          # local development
https://cms.example.com/api        # your deployment (APP_URL + /api)
```

In local development the admin at http://localhost:5173 proxies `/api/*` to the backend, so `http://localhost:5173/api/blog` works too.

## Endpoints per content type

For a content type named `blog`:

| Method | Path | Does | Credentials |
|---|---|---|---|
| `GET` | `/api/blog` | List entries | none for published entries |
| `GET` | `/api/blog/:slug` | Get one entry by slug | none for published entries |
| `POST` | `/api/blog` | Create an entry | write API key or JWT |
| `PUT` | `/api/blog/:slug` | Update an entry | write API key or JWT |
| `DELETE` | `/api/blog/:slug` | Move an entry to the trash | write API key or JWT |

Names with several words use hyphens in the URL: a content type stored as `team_members` is at `/api/team-members` (`/api/team_members` also works). See [Names and URLs](/content-modeling/content-types/#names-and-urls).

Each content type chooses which of these operations it offers under **API Endpoints** in the content type editor. A disabled operation answers `403`. A content type with every operation off is private and isn't reachable through `/api/:type` at all. See [API endpoints](/content-modeling/content-types/#api-endpoints).

There's also `GET /api/:type/:slug/preview?token=…`, which returns a draft for live preview with a signed token. See [Live preview](/content/live-preview/).

## The entry shape

```json title="GET /api/blog/hello-world"
{
  "id": "8c0f8e6e-5b1a-4a39-9d62-0f3c2b6a1d44",
  "slug": "hello-world",
  "locale": "en",
  "data": {
    "title": "Hello world",
    "cover": { "url": "http://localhost:3000/uploads/1730000000000-3f2a9c1e.jpg", "alt": "" },
    "body": "<p>My first post.</p>"
  },
  "seo": null,
  "createdAt": "2026-10-26T09:00:00.000Z",
  "updatedAt": "2026-10-26T09:00:00.000Z"
}
```

- `id` is the entry's permanent public ID (a UUID). It doesn't change when the slug does, and it's what relation fields store.
- `data` holds the field values, keyed by field key.
- `seo` holds the entry's SEO fields, or `null`.
- Status isn't included: without credentials you only ever get published entries.

A list wraps entries in `data` and adds `meta`:

```json title="GET /api/blog"
{
  "data": [ { "id": "8c0f8e6e-…", "slug": "hello-world", "…": "…" } ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1, "nextCursor": null }
}
```

Lists return 20 entries per page by default, newest first. See [Querying](/apis/querying/) for paging and filters.

## Authentication

| Caller | How | Can |
|---|---|---|
| Anyone | no header | Read published entries |
| An API key | `X-API-Key: np_…` | Read unpublished stages, and write with `write` or `all` access, for the content types the key covers |
| A signed-in user | `Authorization: Bearer <JWT>` | Read unpublished stages; write what their role and permissions allow |

```bash
curl -H "X-API-Key: np_3f9c…" "http://localhost:3000/api/blog?stage=draft"
curl -H "Authorization: Bearer eyJhbGciOi…" "http://localhost:3000/api/blog?stage=draft"
```

Create keys under **Developer → API Keys** (admins only). A key has an access level (`read`, `write` or `all`) and a list of content types, or `*` for all of them. A `read` key can't write. A key used on a content type outside its list gets `403`. See [API keys](/access-control/api-keys/) and [Authentication](/access-control/authentication/).

:::caution
API keys are secrets. Keep `write` and `all` keys on your server, never in browser code. Published content needs no key at all.
:::

## Stages: reading unpublished content

Public reads return published entries only. Add `?stage=` to include other statuses:

| `stage` | Returns entries with status |
|---|---|
| `published` (default) | `published` |
| `staging` | `staging`, `published` |
| `draft` | `draft`, `pending_review`, `staging`, `published` |
| `all` | every status, including `archived` |

The header `X-NodePress-Environment: staging` is the same as `?stage=staging`. `?stage=` wins when you send both.

Any stage other than `published` needs credentials: a valid JWT (any role) or an API key of any access level that covers the content type. Without them the API answers `401`.

```bash
curl -H "X-API-Key: np_3f9c…" "http://localhost:3000/api/blog/my-draft?stage=draft"
```

Responses for unpublished stages are sent with `Cache-Control: private, no-store`, so no CDN or shared cache keeps them.

:::note
The REST API applies public field rules to every response, even when you send a token. Fields restricted with read roles are never included in `/api/:type` responses. Signed-in users see them in the admin. See [Field access](/access-control/field-access/).
:::

## Writing entries

Writes need an API key with `write` or `all` access, or a JWT. A JWT user other than an admin also needs the matching permission for the content type (create, update or delete, and publish to create a published entry). See [Permissions](/access-control/permissions/).

Send JSON with `Content-Type: application/json`. Request bodies are limited to 1 MB.

### Create

```bash
curl -X POST http://localhost:3000/api/blog \
  -H "X-API-Key: np_3f9c…" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-first-post",
    "status": "draft",
    "data": { "title": "My first post", "body": "<p>Hello.</p>" }
  }'
```

| Body field | Required | Notes |
|---|---|---|
| `slug` | yes | lowercase letters, digits, single hyphens or underscores; up to 200 characters |
| `data` | yes | field values; checked against the content type's fields |
| `status` | no | `published` (default) or `draft` |
| `locale` | no | language code such as `en`, `fr` or `pt-BR`; default `en` |

The response is `201` with the new entry in the public shape. A slug that already exists in that locale returns `409`.

### Update

```bash
curl -X PUT http://localhost:3000/api/blog/my-first-post \
  -H "X-API-Key: np_3f9c…" \
  -H "Content-Type: application/json" \
  -d '{ "data": { "title": "My first post", "body": "<p>Updated.</p>" } }'
```

`PUT` takes `data` and an optional `locale` (default `en`). It returns `200` with the updated entry.

:::caution[`data` is replaced, not merged]
The `data` you send replaces the entry's stored data. Fields you leave out are removed. Send the complete set of values, for example by reading the entry first and changing what you need. Required fields aren't enforced on update.
:::

The REST update doesn't change the slug or status. Use the admin or the admin API for that.

### Delete

```bash
curl -X DELETE "http://localhost:3000/api/blog/my-first-post?locale=en" \
  -H "X-API-Key: np_3f9c…"
```

Deleting moves the entry to the trash, where an editor can restore it. The response is `200`:

```json
{ "message": "Entry \"my-first-post\" deleted from \"blog\"" }
```

`?locale=` picks the translation to delete; the default is `en`.

### Validation

Values are checked against the content type's fields: types, required fields, lengths, choices and so on. Values aren't converted, so a number field needs a JSON number, not `"42"`. Keys that aren't in the schema are ignored. A failed check returns `422` with every problem at once:

```json
{
  "message": "Data validation failed",
  "errors": ["title: required", "views: must be a number"]
}
```

Writing a field that has write roles, or a reverse relation field, is refused through the public API.

Writes through the REST API trigger the same webhooks, real-time events and plugin hooks as edits in the admin.

## Errors and status codes

Errors are JSON with a `statusCode`, a `message` and an `error` name:

```json
{
  "statusCode": 404,
  "message": "Entry with slug \"nope\" not found in \"blog\" (locale: en)",
  "error": "Not Found"
}
```

| Status | When |
|---|---|
| `200` / `201` | Success (`201` for a create) |
| `304` | Not modified: the `If-None-Match` ETag still matches |
| `400` | Invalid slug, locale, cursor or other parameter; missing `slug` or `data` |
| `401` | Missing or invalid credentials where they're required |
| `403` | Operation disabled on the content type, read-only key, key doesn't cover the type, or missing permission |
| `404` | Content type or entry doesn't exist, or the entry isn't in the requested stage |
| `408` | A read took longer than 10 seconds |
| `409` | Slug already exists in that content type and locale |
| `415` | A write sent without a JSON (or form) `Content-Type` |
| `422` | Entry data failed validation, or a plugin rejected the write |
| `429` | Rate limit exceeded |

## Rate limits

Two limits apply:

- **Per client IP**: 120 requests per minute across the whole API, REST and GraphQL. Behind a proxy, set `TRUST_PROXY` so the real client IP is used. See [Self-hosting](/deployment/self-hosting/).
- **Per API key**: when a request is authorized with an API key (writes, and reads of unpublished stages), it also counts against the key: 120 requests per minute for `read` and `all` keys, 60 for `write` keys.

Responses carry the current state:

```text
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
X-RateLimit-Reset: 60
```

Over the limit, the API answers `429` with a `Retry-After` header. Requests with a JWT don't count against any key limit.

## Caching

Public reads are cached on the server and are safe to put behind a CDN:

- The backend keeps published list responses for 30 seconds and single entries for 60 seconds. Any change to a content type's entries clears that type's cached responses at once, whichever way it was made.
- Responses with `?populate=` or `?fields=` are never cached, since their shape depends on the request.
- Every public `GET` has an `ETag`. Send it back as `If-None-Match` and you get a `304` when nothing changed.
- `Cache-Control` is `public, max-age=0, s-maxage=<ttl>, stale-while-revalidate=60`. Browsers revalidate on every view, which is a cheap `304`; a CDN keeps the response for `s-maxage` seconds (`CDN_CACHE_TTL`: 30 by default, 3600 when a purge driver is configured).
- Published responses carry `Cache-Tag` and `Surrogate-Key` headers so a CDN can purge one content type. See [CDN](/deployment/cdn/).
- Unpublished stages are `private, no-store` and never tagged.

## Interactive reference

Every content type's endpoints, with request and response schemas built from its fields, are described in an OpenAPI document you can browse and try out. See [OpenAPI](/apis/openapi/).
