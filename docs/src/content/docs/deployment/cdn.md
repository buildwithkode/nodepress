---
title: CDN caching
description: Serve the public content API from a CDN with Cache-Control, cache tags and automatic purges for Cloudflare, Fastly or your own purger.
sidebar:
  order: 7
---

Public reads of published content are built to be cached by a CDN. Every response says how long a shared cache may keep it and which content type it belongs to. With a purge driver configured, NodePress purges only the changed content types after every write, so the CDN can cache for an hour and still show a publish within seconds.

## What gets cached

The cache headers apply to the REST read endpoints, `GET /api/<type>` and `GET /api/<type>/<slug>`, for published content:

```http
Cache-Control: public, max-age=0, s-maxage=3600, stale-while-revalidate=60
ETag: "3f1c2a9e0b7d4c5e6f10"
Cache-Tag: np-all,np-ct-4
Surrogate-Key: np-all np-ct-4
```

| Header | Meaning |
|---|---|
| `Cache-Control` | Browsers revalidate on every view (`max-age=0`), which is a cheap `304` thanks to the `ETag`. Shared caches keep the response for `s-maxage` seconds. |
| `ETag` | A hash of the body. A request with a matching `If-None-Match` gets `304 Not Modified`. |
| `Cache-Tag` | Tags for Cloudflare, comma-separated. |
| `Surrogate-Key` | The same tags for Fastly, space-separated. |

Every response carries two tags: `np-all`, and `np-ct-<id>` for its content type.

Reads of unpublished content (`?stage=draft|staging|all` or the `X-NodePress-Environment: staging` header) are sent with `Cache-Control: private, no-store` and no tags, so no CDN keeps them. GraphQL responses don't get these headers. Uploaded files are not part of this: the bundled nginx serves `/uploads/` with a 7-day `immutable` cache, which is safe because every upload gets a new file name.

## How long

`CDN_CACHE_TTL` sets `s-maxage` in seconds:

| Setup | Default `s-maxage` |
|---|---|
| No purge driver (`CDN_PURGE_DRIVER=none`) | 30 seconds |
| With a purge driver | 3600 seconds (one hour) |

Without purging, content can be up to `s-maxage` seconds old at the CDN, so the default stays short.

## Purging

Set `CDN_PURGE_DRIVER` to have NodePress purge the CDN when content changes:

| Driver | Purges with | Needs |
|---|---|---|
| `none` | nothing (default) | |
| `cloudflare` | Cloudflare's purge-by-tag API | `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` |
| `fastly` | Fastly's purge-by-surrogate-key API | `FASTLY_SERVICE_ID`, `FASTLY_API_TOKEN` |
| `webhook` | A signed `POST` to your own URL | `CDN_PURGE_WEBHOOK_URL`, optionally `CDN_PURGE_WEBHOOK_SECRET` |

If a driver's variables are missing, the backend refuses to start and names them.

What happens on a write:

1. Any write to entries or content types, from any source, marks the content types it touched. A write whose types can't be worked out marks everything.
2. Marks are collected for two seconds, so a burst of writes becomes one purge.
3. The purge runs as a `cdn.purge` background job, retried up to 5 times if the CDN's API fails. Failed purges show on the **Jobs** page.

A content type is purged by its `np-ct-<id>` tag. "Everything" is purged by the `np-all` tag, never by purging the whole zone, so the rest of your site stays cached.

:::caution[Populated relations]
A response with `?populate=` carries only the tags of the requested content type. When a linked entry of another type changes, that response isn't purged and stays cached until `s-maxage` runs out. Keep `CDN_CACHE_TTL` short enough for that, or purge those paths yourself.
:::

### Cloudflare

```bash title="backend/.env"
CDN_PURGE_DRIVER=cloudflare
CLOUDFLARE_ZONE_ID=<zone id>
CLOUDFLARE_API_TOKEN=<token with Zone → Cache Purge permission>
```

Cloudflare doesn't cache JSON responses by default. Add a Cache Rule for your API paths (for example, URI path starts with `/api/`) that makes them eligible for cache and uses the origin's cache headers.

### Fastly

```bash title="backend/.env"
CDN_PURGE_DRIVER=fastly
FASTLY_SERVICE_ID=<service id>
FASTLY_API_TOKEN=<token with the purge_select scope>
```

Fastly reads `Surrogate-Key` and honors `s-maxage`.

### Webhook

For a CDN without a built-in driver (Varnish, a hosting platform's cache, your own purger), NodePress posts the tags to your URL:

```bash title="backend/.env"
CDN_PURGE_DRIVER=webhook
CDN_PURGE_WEBHOOK_URL=https://example.com/purge
CDN_PURGE_WEBHOOK_SECRET=<random string>
```

```json title="POST https://example.com/purge"
{ "event": "cdn.purge", "tags": ["np-ct-4"], "timestamp": "2026-10-26T09:00:00.000Z" }
```

With a secret, the request carries `X-NodePress-Signature: sha256=<hex>`, an HMAC-SHA256 of the raw body. Check it before purging, and answer with a `2xx` status; anything else counts as a failure and is retried.

```ts title="purge-endpoint.ts"
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyPurge(rawBody: Buffer, signature: string | undefined, secret: string) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  return !!signature
    && signature.length === expected.length
    && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

Compute the HMAC over the body exactly as received, not over re-serialized JSON.

## Without a CDN

The headers help even with no CDN in front. Browsers get `304` responses for unchanged content, and NodePress also caches public reads in its own memory or Redis, cleared per content type on every write. See [Scaling](/deployment/scaling/#redis).
