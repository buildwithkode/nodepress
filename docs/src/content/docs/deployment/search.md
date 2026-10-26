---
title: Search
description: How ?search= works with the built-in PostgreSQL full-text index, and how to switch to Meilisearch for typo-tolerant, ranked results.
sidebar:
  order: 6
---

`?search=` on a content type's list endpoint finds entries by their text. By default PostgreSQL answers it from a full-text index, with nothing to install. For typo tolerance and relevance ranking, connect [Meilisearch](https://www.meilisearch.com/). How to send searches is covered in [Querying](/apis/querying/); this page is about the engine behind them.

```bash
curl "https://cms.example.com/api/blog?search=getting%20started&limit=10"
```

## What every search does

With either engine, a search:

- covers the entry's slug and all of its field values;
- returns **published** entries only, in the requested `locale` if you pass one;
- pages with `page` and `limit`. `cursor` can't be combined with `search` (400);
- ignores `where`, `filter`, `sort` and `stage`.

The response's `meta.searchMode` says which path answered:

| `searchMode` | Meaning |
|---|---|
| `fulltext` | The PostgreSQL full-text index. |
| `fallback` | A plain substring match, used when PostgreSQL can't parse the search term. |
| `meilisearch` | Meilisearch. |

## PostgreSQL (default)

Each entry has a generated `search_vector` column, built from its slug and data with PostgreSQL's `english` text search configuration and kept current by PostgreSQL itself. A GIN index makes searches fast on large tables. Terms are parsed with `websearch_to_tsquery`, so searches support the familiar web syntax:

| Search | Matches |
|---|---|
| `node cms` | Entries containing both words |
| `"headless cms"` | The exact phrase |
| `node or deno` | Either word |
| `cms -wordpress` | `cms` but not `wordpress` |

English stemming applies: `publishing` also finds `published`. Results come newest first, not by relevance. Nothing needs setting up, and the index can't fall out of date.

## Meilisearch

Meilisearch adds typo tolerance (`nodpress` finds `NodePress`) and orders results by relevance. NodePress keeps its own index of published entries in Meilisearch and falls back to PostgreSQL whenever Meilisearch is unavailable.

### Turn it on

```bash title="backend/.env"
SEARCH_DRIVER=meilisearch
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_KEY=<master or admin API key>
# MEILISEARCH_INDEX=nodepress_entries
```

| Variable | Default | Meaning |
|---|---|---|
| `SEARCH_DRIVER` | `postgres` | `meilisearch` to answer searches with Meilisearch. |
| `MEILISEARCH_URL` | none | Meilisearch's URL. Required with `SEARCH_DRIVER=meilisearch`, or the backend won't start. |
| `MEILISEARCH_KEY` | none | API key. Needs permission to manage the index and its documents. |
| `MEILISEARCH_INDEX` | `nodepress_entries` | Index name. Use different names to share one Meilisearch between sites. |

With Docker, `docker-compose.search.yml` runs Meilisearch and sets these for you. See [Docker](/deployment/docker/#meilisearch).

### Build the index

Restart the backend, then build the index once. Admins can click **Rebuild index** in the **Search** card under **Settings → Email & storage**, or call the API with an admin token:

```bash
curl -X POST -H "Authorization: Bearer <admin JWT>" https://cms.example.com/api/search/reindex
```

The rebuild runs as a background job. Run it again whenever the index may have drifted, for example after restoring a backup or after Meilisearch lost its data.

### How it stays current

Every write to an entry or a content type, from the admin, the API, imports or plugins, queues a `search.sync` job that runs about two seconds later. It adds published entries to the index and removes entries that were unpublished, deleted or moved to the trash. The jobs appear on the **Jobs** page, and failed ones are retried.

The index stores each entry's id, content type, locale, slug and text (HTML tags removed; URLs and relation ids left out).

### When PostgreSQL answers instead

Even with `SEARCH_DRIVER=meilisearch`, PostgreSQL answers when:

- Meilisearch returns an error or doesn't answer within 10 seconds (the backend logs a warning);
- the request uses `?fallback=true` with a `locale`, which Meilisearch can't express.

`meta.searchMode` tells you which one answered.

## Check the engine

`GET /api/search/status` (admin only) returns the active engine:

```json
{ "driver": "meilisearch", "index": "nodepress_entries" }
```

With PostgreSQL, `driver` is `postgres` and `index` is `null`. `POST /api/search/reindex` then returns `"queued": false` with a reason, since that index is always current.
