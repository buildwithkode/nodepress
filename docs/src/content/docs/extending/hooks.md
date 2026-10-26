---
title: Hooks reference
description: Every entry lifecycle event a plugin can subscribe to, the permission it needs, which write paths fire it, and the payload it receives.
sidebar:
  order: 3
---

Plugins react to content changes by subscribing to **events** through their plugin context. This page lists every event, the [permission](/extending/building-plugins/#permissions) it needs, and the payload handlers receive. For how to write a plugin, see [Building plugins](/extending/building-plugins/).

```ts
import { PluginEvents, EntryLifecyclePayload } from '@nodepress/plugin-sdk';

this.ctx.on(PluginEvents.ENTRY_AFTER_PUBLISH, async (payload: EntryLifecyclePayload) => {
  this.ctx.logger.log(`Published ${payload.contentType}/${payload.slug}`);
});
```

## Events

| Constant | Event name | Permission | Fires |
|---|---|---|---|
| `ENTRY_BEFORE_CREATE` | `entry.beforeCreate` | `entries:write` | before a new entry is saved |
| `ENTRY_AFTER_CREATE` | `entry.afterCreate` | `entries:read` | after a new entry is saved |
| `ENTRY_BEFORE_UPDATE` | `entry.beforeUpdate` | `entries:write` | before changes to an entry are saved |
| `ENTRY_AFTER_UPDATE` | `entry.afterUpdate` | `entries:read` | after an entry changed: data, status, or a restore |
| `ENTRY_BEFORE_PUBLISH` | `entry.beforePublish` | `entries:write` | before an unpublished entry becomes published |
| `ENTRY_AFTER_PUBLISH` | `entry.afterPublish` | `entries:read` | after an entry became published |
| `ENTRY_BEFORE_DELETE` | `entry.beforeDelete` | `entries:delete` | before an entry is moved to the trash |
| `ENTRY_AFTER_DELETE` | `entry.afterDelete` | `entries:read` | after an entry was moved to the trash |

How handlers run:

- In priority order, lowest first (default `10`), across all plugins.
- One at a time, each awaited, with a 5-second limit per handler.
- Handlers of disabled plugins are skipped.
- A `PluginVetoError` stops the remaining handlers and rejects the write with `422`. Any other error is logged and the next handler runs.

## Which writes fire which events

| Write | Before-events | After-events | `source` |
|---|---|---|---|
| Create in the admin or GraphQL | `beforeCreate` | `afterCreate` | absent |
| Save in the admin or GraphQL | `beforeUpdate`, plus `beforePublish` when it publishes | `afterUpdate`, plus `afterPublish` when it publishes | absent |
| Delete in the admin | `beforeDelete` | `afterDelete` | absent |
| Public API `POST /api/:type` | `beforeCreate` | `afterCreate` | `api` on the before-event |
| Public API `PUT /api/:type/:slug` | `beforeUpdate` | `afterUpdate` | `api` on the before-event |
| Public API `DELETE /api/:type/:slug` | `beforeDelete` | `afterDelete` | absent |
| Bulk publish | `beforePublish` | `afterUpdate`, `afterPublish` | `bulk` |
| Bulk archive, submit for review, stage | | `afterUpdate` | `bulk` |
| Bulk delete | `beforeDelete` | `afterDelete` | `bulk` |
| Promote to another stage | `beforePublish` when it publishes | `afterUpdate`, plus `afterPublish` when it publishes | `promote` |
| Release published | `beforePublish` for entries it publishes | `afterUpdate` for every entry, plus `afterPublish` | `release` |
| Scheduled publish (`publishAt`) | | `afterUpdate`, `afterPublish` | `scheduler` |
| Restore from trash, restore a version | | `afterUpdate` | `restore` |
| Create a translation | | `afterCreate` | `translation` |
| Entry JSON import | | `afterCreate` or `afterUpdate` | `import` |
| WordPress import, starter templates | `beforeCreate` | `afterCreate` | `import` for WordPress, absent for templates |

Things that follow from the table:

- **A scheduled publish can't be vetoed.** It was approved when someone set `publishAt`; reject it in `beforeUpdate` at that point instead.
- **Creating an entry as published** fires `beforeCreate` and `afterCreate`, not the publish events. Check `payload.status === 'published'` in your create hooks if that matters.
- **Bulk actions** stop at the first veto; no entry in the batch is changed.

## Payloads

The payload type is `EntryLifecyclePayload`:

```ts
interface EntryLifecyclePayload {
  id?: number;              // internal entry id; absent on beforeCreate
  slug: string;
  status: string;           // draft, pending_review, staging, published, archived
  contentType: string;      // the content type's name, e.g. "blog"
  locale?: string;
  data?: Record<string, any>;
  source?: 'api' | 'bulk' | 'import' | 'restore' | 'translation' | 'scheduler' | 'promote' | 'release';
  restoredFromVersion?: number;  // only on a version restore
}
```

Not every write path fills every field, so read them defensively. What each path sends:

### `entry.beforeCreate`

| From | Fields |
|---|---|
| Admin, GraphQL, imports, templates | `slug`, `status`, `contentType`, `data`, `dto` (the full create request), `actorId`, `role`, `customRole` (for custom roles), `source` |
| Public API | `slug`, `status`, `contentType`, `locale`, `data`, `source: "api"` |

`data` is what's about to be saved. Change it in place to change the entry. `role` is the base role of the user saving (`admin`, `editor`…); it's absent for API-key writes.

### `entry.beforeUpdate`

| From | Fields |
|---|---|
| Admin, GraphQL, WordPress import | `id`, `contentType`, `data`, `dto` (the full update request), `currentEntry` (the entry as stored now), `actorId`, `role`, `customRole`, `source` |
| Public API | `id`, `slug`, `status`, `contentType`, `locale`, `data`, `source: "api"` |

`data` is the data that will replace the stored data. It's absent when the request doesn't change the data, such as a status-only change. On the admin path, compare it with `currentEntry.data` to see what changed.

### `entry.beforePublish`

| From | Fields |
|---|---|
| Admin and GraphQL saves | `id`, `entry` (the stored entry, including its `data`, `status` and `contentType`) |
| Bulk, promote, release | the standard fields: `id`, `slug`, `status`, `contentType`, `locale`, `data`, `source` |

Data changes in `beforePublish` aren't saved; use `beforeUpdate` for that. Use `beforePublish` to veto.

### `entry.beforeDelete`

| From | Fields |
|---|---|
| Admin, public API | `id`, `entry` (the stored entry) |
| Bulk delete | the standard fields with `source: "bulk"` |

### After-events

`entry.afterCreate`, `entry.afterUpdate` and `entry.afterPublish` carry `id`, `slug`, `status` and `contentType`, and on most paths `data` (the saved data), `locale` and `source`. The admin's own `afterPublish` sends only `id`, `slug`, `status` and `contentType`.

`entry.afterDelete` carries `id`, `slug` and `contentType`; bulk deletes send the standard fields.

## Filters

`ctx.addFilter(name, handler)` adds a handler to a named pipeline: each handler gets the value, returns a new one, and the next handler gets that. Errors are logged and the value passes through unchanged.

NodePress doesn't run any filter pipelines of its own yet, so filters only do something when another plugin applies them. Use events for core behaviour.

## Seeing what's registered

`GET /api/plugins/hooks` (admin or editor) returns how many hooks and filters are registered and for which events:

```json
{ "totalHooks": 4, "totalFilters": 0, "events": ["entry.beforeCreate", "entry.beforeUpdate"] }
```

The **Plugins** page shows the same counts as **Lifecycle Action Hooks** and **Data Pipeline Filters**.

## Hooks, webhooks or realtime?

| Use | When |
|---|---|
| Plugin hooks | Code inside NodePress that changes or rejects content, or reacts to every write |
| [Webhooks](/apis/webhooks/) | Another service reacts to changes over HTTP, with retries |
| [Realtime](/apis/realtime/) | A browser or app shows changes live |
