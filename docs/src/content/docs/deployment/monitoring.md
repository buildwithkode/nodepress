---
title: Monitoring
description: Health checks, Prometheus metrics, the bundled Grafana dashboard, structured logs and Sentry error tracking.
sidebar:
  order: 10
---

NodePress gives you four ways to see how a site is doing: a health check for load balancers and uptime monitors, Prometheus metrics, JSON logs, and optional error tracking with Sentry. The Docker production stack adds Prometheus and a Grafana dashboard out of the box.

## Health check

`GET /api/health` needs no authentication. It checks the database, the cache, file storage and memory, and answers `200` when all are up or `503` when any is down:

```json title="GET /api/health"
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "cache": { "status": "up", "driver": "redis" },
    "storage": { "status": "up", "driver": "local" },
    "memory": { "status": "up", "heapUsedMB": 118, "thresholdMB": 1863 }
  },
  "error": {},
  "details": { "…": "the same checks as info and error together" }
}
```

| Check | Down when |
|---|---|
| `database` | `SELECT 1` fails. |
| `cache` | `REDIS_URL` is set but Redis can't be reached. The backend keeps working with an in-memory cache (`driver: in-memory-fallback`), but instances no longer share it. Without `REDIS_URL` the check is always up (`driver: in-memory`). |
| `storage` | With local storage, the `uploads/` folder isn't accessible. |
| `memory` | The heap is above `thresholdMB`: 90% of Node's heap limit, or `HEALTH_MAX_HEAP_MB`. Raise the limit itself with `NODE_OPTIONS=--max-old-space-size=<MB>`. |

Point your load balancer, container health check or uptime monitor at it. Health checks aren't written to the request log.

## Metrics

`GET /api/metrics` returns metrics in Prometheus text format.

| Metric | Type | Labels |
|---|---|---|
| `http_requests_total` | counter | `method`, `path`, `status` |
| `http_request_duration_seconds` | histogram | `method`, `path`, `status` |
| `nodepress_*` | Node.js process metrics: CPU, memory, heap, event loop lag, garbage collection | |

`path` is the route pattern, such as `/api/:type/:slug`, not the actual URL, so the number of series stays small.

### Protect the endpoint

`/api/metrics` is open unless you set `METRICS_TOKEN`:

```bash title="backend/.env"
METRICS_TOKEN=<random string>
```

Then every request needs `Authorization: Bearer <METRICS_TOKEN>`, and others get `401`. The bundled nginx also blocks `/api/metrics` from outside (403), so only Prometheus on the Docker network can reach it. Do one or both in production.

With a token, tell Prometheus to send it:

```yaml title="monitoring/prometheus.yml"
scrape_configs:
  - job_name: 'nodepress-backend'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['backend:3000']
    authorization:
      credentials: '<METRICS_TOKEN>'
```

## The monitoring stack

`docker-compose.prod.yml` runs Prometheus and Grafana next to NodePress, configured from the `monitoring/` folder:

| File | What it holds |
|---|---|
| `monitoring/prometheus.yml` | Scrapes the backend every 15 seconds. Metrics are kept for 15 days. |
| `monitoring/alerts.yml` | Alert rules (below). |
| `monitoring/grafana/provisioning/` | Adds Prometheus as Grafana's data source and loads the dashboard. |
| `monitoring/grafana/dashboards/nodepress.json` | The **NodePress Overview** dashboard. |

The dashboard shows the request rate, the 5xx error rate, P99 latency, memory used, requests by path, response time percentiles, heap usage and event loop lag.

<!-- screenshot: the NodePress Overview dashboard in Grafana -->

Grafana's login is `GRAFANA_USER` / `GRAFANA_PASSWORD` from `.env` (default `admin` / `changeme`: change it). Neither Grafana nor Prometheus publishes a port, so they aren't reachable from outside by default. To open Grafana, add a port mapping to the `grafana` service (for example `127.0.0.1:3002:3000`, then use an SSH tunnel), or add a `/grafana/` location to nginx: Grafana is already configured to serve from that sub-path.

### Alerts

| Alert | Fires when | Severity |
|---|---|---|
| `HighErrorRate` | More than 5% of requests return 5xx, for 2 minutes | critical |
| `HighLatency` | P99 latency above 3 seconds, for 5 minutes | warning |
| `HighRequestRate` | More than 500 requests per second, for 2 minutes | warning |
| `HighMemoryUsage` | Heap above 450 MB, for 5 minutes | warning |
| `CriticalMemoryUsage` | Heap above 700 MB, for 2 minutes | critical |
| `BackendDown` | Prometheus can't scrape the backend, for 1 minute | critical |

Prometheus evaluates the rules, but the stack has no Alertmanager, so nothing is sent anywhere. Add Alertmanager, or alert from Grafana, to get notified. Adjust the memory thresholds to your backend's memory limit.

## Logs

The backend logs with [pino](https://getpino.io/). With `NODE_ENV=production`, each line is one JSON object, ready for Loki, Datadog, CloudWatch or any log collector; in development the output is pretty-printed.

| Setting | Default | Meaning |
|---|---|---|
| `LOG_LEVEL` | `info` in production, `debug` otherwise | `debug`, `info`, `warn` or `error`. |

Every HTTP request is logged with its method, URL, status and response time. Each request gets an id, returned in the `X-Request-Id` response header; send your own `X-Request-Id` to carry an id through from your proxy. `Authorization` and `X-API-Key` headers are removed from the logs.

The backend also logs at startup what it's using: storage, Redis, the realtime adapter, email, a read replica. Read the first lines after a deploy to check the configuration.

For failures that don't show up as errors in the log, check the admin: failed background jobs on the **Jobs** page, failed webhook deliveries in the webhooks' **Delivery Log**, and who changed what in the [Audit log](/access-control/audit-log/).

## Sentry

[Sentry](https://sentry.io) error tracking is optional, for the backend and the admin panel separately.

| Where | Variable | What it captures |
|---|---|---|
| Backend | `SENTRY_DSN` | Unhandled errors and 5xx responses (4xx responses are not sent), plus performance traces: 20% of transactions in production, all of them otherwise. |
| Frontend | `NEXT_PUBLIC_SENTRY_DSN` | Errors in the admin panel, performance traces (20% in production), and session replays: 10% of sessions and every session with an error. |

The Sentry packages add about 100 MB, so a project made with `create-nodepress-app` only includes them with `--sentry`:

```bash
npx create-nodepress-app my-site --sentry
```

Without the packages, a DSN does nothing except log a warning that Sentry isn't installed. To add backend error tracking to a project created without `--sentry`, install `@sentry/nestjs` and `@sentry/profiling-node` in `backend/` and set `SENTRY_DSN`. The frontend also needs the Sentry config files (`frontend/sentry.*.config.ts`) and `frontend/lib/report-error.ts` that such a project leaves out; copy them from the NodePress repository and install `@sentry/nextjs`. `NEXT_PUBLIC_SENTRY_DSN` is read when the frontend is built, so rebuild after setting it.

The backend doesn't send personal data such as IP addresses or emails, and session replays mask all text and block media.
