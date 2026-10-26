---
title: Real-time events
description: Receive live entry and media events over Socket.io, and use entry presence and edit locks.
sidebar:
  order: 6
---

NodePress pushes events over [Socket.io](https://socket.io) when entries and media change. The admin uses them to refresh lists live and to show who else is editing an entry. You can connect from your own tools too, for example a dashboard or a script that reacts to new uploads.

For notifying other servers, such as rebuilding a static site, use [webhooks](/apis/webhooks/) instead: they're delivered even when nothing is connected, and they're retried.

## Connecting

The gateway is the Socket.io namespace `/realtime`, served at the path `/api/realtime`. Both must be set:

```ts
import { io } from 'socket.io-client';

const socket = io('https://cms.example.com/realtime', {
  path: '/api/realtime',
  auth: { token: `Bearer ${jwt}` },      // or: auth: { apiKey: 'np_…' }
  transports: ['websocket', 'polling'],
});

socket.on('entry:updated', (event) => console.log('updated', event));
```

:::caution
Connecting to the bare URL (`https://cms.example.com`) joins the default namespace. The connection succeeds but never receives any events. The URL must end in `/realtime`.
:::

The browser must be on an origin allowed by `CORS_ORIGIN`, the same rule as the HTTP API.

## Authentication

Every connection needs credentials, sent in any of these ways:

| Credential | How |
|---|---|
| JWT | `auth: { token: 'Bearer <jwt>' }` (the `Bearer ` prefix is optional), or an `Authorization: Bearer <jwt>` header |
| API key | `auth: { apiKey: 'np_…' }`, or an `X-API-Key` header |

Any valid API key can connect, whatever its access level and content types. It connects as a viewer. A connection without valid credentials receives an `error` event with `{ message }` and is disconnected.

## Events

Every connection receives these events:

| Event | Payload | Sent when |
|---|---|---|
| `entry:created` | `{ id, slug, contentType, locale }` | an entry, or a translation of one, is created |
| `entry:updated` | `{ id, slug, contentType, locale, status }` | an entry is saved, promoted or restored from a version |
| `entry:deleted` | `{ id, slug, contentType }` | an entry is moved to the trash |
| `media:uploaded` | `{ id, filename, url, mimetype }` | a file is uploaded |
| `media:deleted` | `{ filename }` | a file is deleted |

```json title="entry:updated"
{ "id": 42, "slug": "hello-world", "contentType": "blog_post", "locale": "en", "status": "published" }
```

- `id` is the entry's **numeric** ID, the one the admin API (`/api/entries/:id`) uses, not the public UUID.
- `contentType` is the stored content type name (`blog_post`).
- Bulk actions in the admin (bulk publish, archive, delete), scheduled publishing, releases and restoring from the trash don't send events.

Events carry identifiers only. Fetch the entry from the API if you need its content.

### Content type rooms

You can join a room for one content type:

```ts
const ack = await socket.emitWithAck('subscribe', { contentType: 'blog_post' });
// { subscribed: 'blog_post' }
socket.emit('unsubscribe', { contentType: 'blog_post' });
```

:::note
Every connection already receives every entry event. Joining a room makes that type's entry events arrive a second time, so filter on `contentType` in your handler instead of subscribing.
:::

## Presence and edit locks

The entry editor uses the gateway to show who has an entry open, and to give one person at a time the edit lock. You can use the same messages. They take the entry's numeric `id`.

| Send | Data | Reply (acknowledgement) |
|---|---|---|
| `entry:join` | `{ entryId }` | `{ success, entryId, users, lock }` |
| `entry:leave` | `{ entryId }` | `{ success, entryId }` |
| `entry:requestLock` | `{ entryId }` | `{ acquired, lock }` |
| `entry:heartbeat` | `{ entryId }` | `{ renewed, expiresAt }` |
| `entry:releaseLock` | `{ entryId }` | `{ released }` |
| `entry:takeoverLock` | `{ entryId }` | `{ acquired, lock }` |

Everyone who joined the entry receives:

| Event | Payload |
|---|---|
| `entry:presence` | `{ entryId, users: [{ id, email, role, joinedAt }] }` |
| `entry:lockAcquired` | `{ entryId, lock }` |
| `entry:lockReleased` | `{ entryId, userId }` |
| `entry:lockTakeover` | `{ entryId, previousLock, newLock }` |

A `lock` is `{ userId, email, role, lockedAt, expiresAt }`.

- A lock lasts 60 seconds. Send `entry:heartbeat` to renew it; the editor does this while it's open.
- Leaving the entry or disconnecting releases your lock.
- `entry:releaseLock` works for the lock holder or an admin.
- `entry:takeoverLock` is for admins and editors. It replaces the current holder's lock.
- Locks are advisory. They tell editors someone else is working; the API doesn't refuse saves from others.

## Multiple instances

With `REDIS_URL` set, events are shared between backend instances through Redis, so a client connected to one instance hears about changes made on another. Polling transport across several instances needs sticky sessions; the bundled nginx config uses `ip_hash` for `/api/realtime`. See [Scaling](/deployment/scaling/).

Presence and locks are kept in each instance's memory. Two editors connected to different instances don't see each other's presence or locks.
