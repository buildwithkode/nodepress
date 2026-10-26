---
title: Scaling
description: Run several backend instances with Redis, shared storage and background workers, add a read replica, and keep queries fast.
sidebar:
  order: 5
---

One backend instance handles a lot: public reads are cached, and the database does the heavy lifting with indexes. When you need more, NodePress scales horizontally. Run more backend instances behind a load balancer and give them a shared Redis and shared file storage.

## What multiple instances need

| Need | Why | How |
|---|---|---|
| Redis | The cache, rate limits and live updates must be shared. | Set `REDIS_URL` on every instance. |
| Shared file storage | Each instance would otherwise see only its own uploads. | [S3-compatible storage](/deployment/storage/). |
| The same environment | Every instance must sign and check logins with the same key. | Same `JWT_SECRET`, `DATABASE_URL` and the rest on every instance. |
| Sticky sessions for `/api/realtime` | Live updates fall back to long-polling when WebSockets are blocked, and all of a client's polling requests must reach the same instance. | The bundled nginx pins each client IP to one instance (`ip_hash`). |

Everything else is safe to run on every instance: scheduled publishing, releases and nightly cleanups are written so that running them on several instances at once does no harm, and background queues coordinate through the database. Content type changes reach the other instances' GraphQL schemas within `GRAPHQL_SCHEMA_POLL_MS` (default 10 seconds).

With Docker, see [More backend replicas](/deployment/docker/#more-backend-replicas).

## Redis

`REDIS_URL` is optional with one instance and required with more:

```bash title="backend/.env"
REDIS_URL=redis://localhost:6379
```

When it's set:

- **Cache**: cached public API responses are shared, and a write on one instance clears them for all.
- **Rate limits**: counters are shared, so three instances don't allow three times the limit.
- **Live updates**: Socket.io events reach clients on every instance.

Without `REDIS_URL`, each of these lives in the instance's memory. If Redis becomes unreachable, the cache and rate limits fall back to memory rather than failing requests, and [`/api/health`](/deployment/monitoring/#health-check) reports the cache as `down` with driver `in-memory-fallback`.

Give Redis a memory limit with an eviction policy, as the Docker stacks do (`--maxmemory 128mb --maxmemory-policy allkeys-lru`).

## Background workers

Webhook deliveries and background jobs (form emails and webhooks, search sync, CDN purges, imports) are queued in PostgreSQL. Every instance runs workers that claim due work with `FOR UPDATE SKIP LOCKED`, so adding instances adds capacity and no item is processed twice. If an instance dies mid-delivery, the item is picked up again after its lease runs out.

| Variable | Default | Meaning |
|---|---|---|
| `QUEUE_WORKER` | `true` | `false` stops the workers on this instance. |
| `QUEUE_POLL_MS` | `1000` | How often an idle worker checks for due work, in milliseconds. |
| `WEBHOOK_CONCURRENCY` | `10` | Webhook deliveries in flight per instance. |
| `JOB_CONCURRENCY` | `5` | Background jobs in flight per instance. |

To separate the API from background work, run some instances with `QUEUE_WORKER=false` that serve traffic, and others behind no load balancer that only run workers. Keep at least one instance with workers, or webhooks and form emails stop going out. Admins can watch the queues on the **Jobs** page and in the webhooks' **Delivery Log**.

## Database connections

Each backend instance opens its own pool of PostgreSQL connections. With many instances, put a connection pooler such as PgBouncer in front of PostgreSQL in transaction mode, and add `?pgbouncer=true&connection_limit=<n>` to `DATABASE_URL`. Without `pgbouncer=true`, Prisma fails under load with `prepared statement "s0" already exists`. Keep `DIRECT_URL` pointed at PostgreSQL itself, because migrations can't run through transaction pooling. [Installation](/getting-started/installation/#hosted-postgresql-supabase-neon-railway) shows the same setup for hosted poolers, and the [Docker production stack](/deployment/docker/#connection-pooling) includes PgBouncer.

## Read replica

Point `DATABASE_REPLICA_URL` at a PostgreSQL read replica to move public reads off the primary:

```bash title="backend/.env"
DATABASE_REPLICA_URL=postgresql://user:password@replica-host:5432/nodepress
# REPLICA_READ_AFTER_WRITE_MS=5000
```

- Public content reads (`GET /api/<type>` and `GET /api/<type>/<slug>`) go to the replica.
- Writes, the admin panel and previews always use the primary.
- After a write to a content type, its reads stay on the primary for `REPLICA_READ_AFTER_WRITE_MS` (default 5000 ms), so a lagging replica can't put stale content back into the cache. With Redis, this applies across instances.

## Fast filters on large content types

Filters on fields inside an entry's data (`?where[category][eq]=news`) scan every entry of the type unless the field is indexed. Mark the fields you filter or sort on as **Indexed**. See [Indexed fields](/content-modeling/fields/#indexed-fields). Full-text search uses its own index and needs nothing; see [Search](/deployment/search/).

## Caching in front

The cheapest request is the one that never reaches NodePress. Public reads of published content carry `s-maxage` and cache tags, so a CDN can serve them and is purged on every write. See [CDN caching](/deployment/cdn/).

## Restarts

**Restart now** (after a plugin or storage change) restarts only the instance that received the request. Restart the other instances too, for example with a rolling restart, so they all load the same plugins and settings.
