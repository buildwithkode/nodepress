---
title: Building plugins
description: Write a NodePress plugin, from the manifest and Nest module to hooks, vetoes, settings, background jobs and API routes.
sidebar:
  order: 2
---

A NodePress plugin is a [NestJS](https://docs.nestjs.com/) module plus a **manifest** that describes it. The module's services talk to NodePress through a **plugin context**: they subscribe to entry events, read their settings and queue background jobs.

There are two ways to ship one:

| | Bundled | Uploaded |
|---|---|---|
| Lives in | your NodePress code, `backend/src/plugins/<id>/` | a `.zip` package, stored in the database |
| Installed by | registering it in `backend/src/plugin/plugins.config.ts` | an admin, under **Plugins → Upload plugin** or **Browse** |
| Written in | TypeScript, compiled with the backend | compiled JavaScript (CommonJS) |
| Imports the SDK from | `../../plugin/plugin-sdk` | `@nodepress/plugin-sdk` |
| Good for | features specific to your install | plugins you share or sell |

The code is the same either way. This page builds a small plugin, then covers each part.

## A complete example

This plugin stamps an `_excerpt` on every saved entry and rejects entries without a title in the `blog` content type.

```ts title="manifest.ts"
import { PluginManifest } from '@nodepress/plugin-sdk';

export const ExcerptManifest: PluginManifest = {
  id: 'excerpt',
  name: 'Auto Excerpt',
  version: '1.0.0',
  description: 'Stores a short excerpt of the body on every entry.',
  author: 'Acme',
  category: 'content',
  icon: 'Scissors',
  nodepress: '^1.7.0',
  permissions: ['entries:write'],
  configSchema: [
    { name: 'sourceField', label: 'Field to excerpt', type: 'text', defaultValue: 'body', required: true },
    { name: 'length', label: 'Length (characters)', type: 'number', defaultValue: 160 },
  ],
  defaultConfig: { sourceField: 'body', length: 160 },
};
```

```ts title="excerpt.service.ts"
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  EntryLifecyclePayload, InjectPluginContext, PluginContext, PluginEvents, PluginVetoError,
} from '@nodepress/plugin-sdk';

@Injectable()
export class ExcerptService implements OnModuleInit {
  constructor(@InjectPluginContext() private readonly ctx: PluginContext) {}

  onModuleInit() {
    const handler = (p: EntryLifecyclePayload) => this.beforeSave(p);
    this.ctx.on(PluginEvents.ENTRY_BEFORE_CREATE, handler);
    this.ctx.on(PluginEvents.ENTRY_BEFORE_UPDATE, handler);
  }

  private beforeSave(payload: EntryLifecyclePayload) {
    const data = payload.data;
    if (!data) return; // e.g. a status-only update

    if (payload.contentType === 'blog' && 'title' in data && !String(data.title ?? '').trim()) {
      throw new PluginVetoError('Blog posts need a title');
    }

    const { sourceField, length } = this.ctx.config<{ sourceField: string; length: number }>();
    const text = typeof data[sourceField] === 'string' ? data[sourceField].replace(/<[^>]+>/g, '') : '';
    if (text) data._excerpt = text.slice(0, Number(length) || 160);
  }
}
```

```ts title="excerpt.module.ts"
import { Module } from '@nestjs/common';
import { PluginContextModule } from '@nodepress/plugin-sdk';
import { ExcerptManifest } from './manifest';
import { ExcerptService } from './excerpt.service';

@Module({
  imports: [PluginContextModule.forPlugin(ExcerptManifest)],
  providers: [ExcerptService],
})
export class ExcerptModule {}
```

The bundled `word-count` and `seo-analyzer` plugins in `backend/src/plugins/` follow the same pattern and are good references.

## The manifest

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | Unique id, kebab-case: lowercase letters, digits and `-`, 3 to 64 characters |
| `name` | yes | Display name |
| `version` | yes | Semver version, such as `1.2.0` |
| `description` | yes | One or two sentences for the Plugins page |
| `permissions` | yes | What the plugin needs; see [Permissions](#permissions). Can be `[]`. |
| `nodepress` | uploads | NodePress versions it works with, as a semver range (`^1.7.0`). On another version it's listed as **Incompatible** and stays off. |
| `author`, `homepage` | | Shown on the Plugins page |
| `category` | | `content`, `seo`, `analytics`, `security`, `integrations` or `utilities` |
| `icon` | | A [Lucide](https://lucide.dev/icons/) icon name, such as `FileText` |
| `configSchema` | | Settings fields; see [Settings](#settings) |
| `defaultConfig` | | Initial settings values |
| `adminModules` | | Admin modules the plugin adds to **Users → Permissions**; see [Adding API routes](#adding-api-routes) |

An uploaded package has its manifest in `nodepress-plugin.json` with two more keys, `main` and `files`; see [Packaging an uploaded plugin](#packaging-an-uploaded-plugin).

## Permissions

A plugin declares what it does. The Plugins page shows the list to admins before they install it, and the plugin context refuses to subscribe to an event the manifest doesn't cover.

| Permission | Allows |
|---|---|
| `entries:read` | Subscribing to the after-create, after-update, after-publish and after-delete events |
| `entries:write` | Subscribing to before-create, before-update and before-publish, to change or reject entries |
| `entries:delete` | Subscribing to before-delete, to react to or veto deletion |
| `jobs:run` | Registering and queueing background jobs |
| `content-types:write` | Declares that it creates or changes content types |
| `media:read` | Declares that it reads media library items |
| `settings:read`, `settings:write` | Declares that it reads or changes install settings |
| `routes:public` | Declares that it exposes HTTP routes that need no login |
| `*` | Everything (the install review warns about it) |

The first four are enforced. Subscribing without the permission throws at startup:

```text
Plugin "excerpt" needs the "entries:write" permission to subscribe to "entry.beforeCreate" — add it to "permissions" in its manifest
```

The rest are not enforced by NodePress, because a plugin's code can reach the database and the network directly. Declare them anyway: they're how admins know what your plugin does. An uploaded package with an unknown permission name is refused.

## The plugin context

Import `PluginContextModule.forPlugin(manifest)` in your plugin's module, and inject the context with `@InjectPluginContext()` into any of its providers. The context is scoped to your plugin: hooks register under your id, you only see your own settings, and your job types are namespaced.

| Member | What it does |
|---|---|
| `ctx.id`, `ctx.manifest` | Your plugin's id and manifest |
| `ctx.logger` | A Nest `Logger` labelled `Plugin:<id>` |
| `ctx.isEnabled()` | Whether an admin has the plugin turned on right now |
| `ctx.config<T>()` | Current settings: `defaultConfig` merged with what the admin saved |
| `ctx.onConfigChange(fn)` | Calls `fn(config)` whenever an admin saves settings |
| `ctx.on(event, handler, { priority })` | Subscribes to an event. Lower priority runs first; default `10`. |
| `ctx.addFilter(name, handler, { priority })` | Adds a filter to a named pipeline |
| `ctx.jobs.register(type, handler)` | Registers a background job handler |
| `ctx.jobs.enqueue(type, payload, { delayMs, maxAttempts })` | Queues a job |

Register hooks in `onModuleInit()`. When the plugin is turned off, its handlers are skipped automatically; you don't need to check `isEnabled()` in them.

## Hooks

Events fire around every entry write: create, update, publish and delete, from the admin, the public API, bulk actions, imports, releases and the scheduler. The full list, with payloads and which write paths fire them, is on [Hooks reference](/extending/hooks/).

- **Before-hooks** run before the write. Change `payload.data` **in place** (`payload.data.x = …`) to change what's saved; assigning a new object to `payload.data` has no effect on admin saves. Throw `PluginVetoError` to reject the write.
- **After-hooks** run once the write is done. Use them for side effects: notify a service, update a search index, queue a job.
- Handlers may be `async`. Each one has **5 seconds**; past that it's abandoned and logged.
- Any error other than a veto is logged and ignored, and the next handler runs. A broken plugin can't block saves.

## Rejecting a write

Throw `PluginVetoError` from a before-hook:

```ts
if (Number(payload.data?.price) < 0) {
  throw new PluginVetoError('Price cannot be negative');
}
```

The write doesn't happen, and the client gets `422`:

```json
{ "statusCode": 422, "error": "Rejected by plugin", "message": "Price cannot be negative", "plugin": "excerpt" }
```

In a bulk action, a veto on one entry stops the whole action. Only throw `PluginVetoError` from before-hooks: from an after-hook, the write has already happened, but the client would still get the `422`.

## Changing entry data

Keys your plugin adds to `payload.data` are stored with the entry and returned by the API like any field, though they aren't in the schema and don't show in the editor form.

- **Use `snake_case` keys.** Keys are lowercased on save, and spaces and hyphens become `_`, so `readingTime` would be stored as `readingtime`.
- **Prefix them** with `_` (as the bundled plugins do with `_word_count`) so they can't clash with a field someone adds later.
- On admin saves, before-hooks run before validation, so values you set for real schema fields must still be valid for those fields.

## Settings

`configSchema` turns into a settings form under **Configure** on the Plugins page.

| Key | Meaning |
|---|---|
| `name` | Settings key, read with `ctx.config().name` |
| `label` | Form label |
| `type` | `text`, `number`, `boolean`, `textarea`, `select` or `password` |
| `description` | Help text |
| `defaultValue` | Initial value |
| `options` | For `select`: `[{ "label": "…", "value": … }]` |
| `required` | Marks the field required |

`password` values are never sent to the browser or written to the audit log. Read settings with `ctx.config()` when you need them rather than caching them at startup, or listen with `ctx.onConfigChange()`, because admins can change them at any time.

## Background jobs

For slow work, such as calling an external API after a publish, queue a job instead of doing it in the hook. Jobs need the `jobs:run` permission.

```ts
onModuleInit() {
  this.ctx.jobs.register('notify', async (payload) => {
    const res = await fetch('https://hooks.example.com/published', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`); // throw to retry
  });

  this.ctx.on(PluginEvents.ENTRY_AFTER_PUBLISH, (p: EntryLifecyclePayload) =>
    this.ctx.jobs.enqueue('notify', { id: p.id, slug: p.slug, contentType: p.contentType }),
  );
}
```

Job types are stored as `<plugin-id>.<type>` (`excerpt.notify`), so they can't clash with other plugins. A handler that throws is retried after 1 minute, then 10 minutes, up to `maxAttempts` (default 3). Admins see the queue under **Jobs**. Jobs queued while the plugin is off fail with a clear message instead of running.

## Adding API routes

Add Nest controllers to your module, or to sub-modules it imports:

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('excerpt')
export class ExcerptController {
  @Get('status')
  status() {
    return { ok: true };
  }
}
```

The route is served under `/api`: `GET /api/excerpt/status`.

- **Routes are public unless you add a guard.** To require a NodePress login, use `@UseGuards(AuthGuard('jwt'))` from `@nestjs/passport`, the same guard the core uses; `req.user` then has `id`, `email` and `role`. Declare `routes:public` if any route needs no login.
- **To let admins decide who can use a route**, declare a module in the manifest and check it with `@Access`:

  ```ts
  // manifest
  adminModules: [{ key: 'excerpt', label: 'Excerpts', defaults: { editor: 'edit', contributor: 'view' } }],
  ```

  ```ts
  import { UseGuards, Post } from '@nestjs/common';
  import { AuthGuard } from '@nestjs/passport';
  import { Access, RolesGuard } from '@nodepress/plugin-sdk';

  @Controller('excerpt')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Access('excerpt', 'view')
  export class ExcerptController {
    @Post('rebuild')
    @Access('excerpt', 'edit')
    rebuild() { /* … */ }
  }
  ```

  While the plugin is on, the module is listed under **Plugins** on the permissions page with No access / View / Edit per role. Roles missing from `defaults` start at No access; admins always pass. Module keys are snake_case and must not clash with a core module. A nav item in the admin can name the same `module` to be hidden from roles without access.
- When the plugin is turned off, its routes answer `404`.
- Plugin routes take precedence over content type routes, so a route at `/api/products` would shadow a content type named `products`. Use your plugin id as the path prefix.

## Packaging an uploaded plugin

An uploaded plugin is a zip with this layout:

```text
nodepress-plugin.json   the manifest
dist/index.js           the entry file ("main")
dist/…                  the rest of your compiled code
node_modules/…          your own runtime dependencies, if any
README.md               optional; README, LICENSE and CHANGELOG files are included automatically
nodepress-plugin.sig    the signature, added by `plugin pack --key`
```

```json title="nodepress-plugin.json"
{
  "id": "excerpt",
  "name": "Auto Excerpt",
  "version": "1.0.0",
  "description": "Stores a short excerpt of the body on every entry.",
  "author": "Acme",
  "nodepress": "^1.7.0",
  "permissions": ["entries:write"],
  "configSchema": [
    { "name": "sourceField", "label": "Field to excerpt", "type": "text", "defaultValue": "body", "required": true }
  ],
  "defaultConfig": { "sourceField": "body", "length": 160 },
  "main": "dist/index.js",
  "files": ["dist"]
}
```

- `main` is the entry file (default `dist/index.js`). `files` lists what to put in the zip (default `["dist"]`).
- The entry file must export `module` (your Nest module) and `manifest`, either as named CommonJS exports or on `default`:

  ```ts title="src/index.ts"
  export { ExcerptModule as module } from './excerpt.module';
  export { ExcerptManifest as manifest } from './manifest';
  ```

- The exported `manifest` must have the same `id`, `version` and `permissions` as `nodepress-plugin.json`, or the plugin isn't loaded.
- Compile to CommonJS with decorators enabled (`experimentalDecorators` and `emitDecoratorMetadata` in `tsconfig.json`), as for any Nest code.

**Dependencies.** The running server provides `@nodepress/plugin-sdk`, every `@nestjs/*` package, `@prisma/client`, `rxjs`, `reflect-metadata`, `class-validator` and `class-transformer`. A plugin always gets the server's copies, even if it bundles its own, so leave them out of the zip and mark them as peer or dev dependencies. Anything else your code needs goes in the zip's `node_modules`.

`@nodepress/plugin-sdk` isn't published to npm; it's resolved to the server's plugin SDK at runtime. For TypeScript, declare it in your project (for example a `declare module '@nodepress/plugin-sdk';` file) or copy the types from `backend/src/plugin/` in the NodePress repository.

To build the zip and sign it, see [Publishing plugins](/extending/publishing-plugins/).

## Registering a bundled plugin

For a plugin that lives in your own NodePress code, put it in `backend/src/plugins/<id>/`, import the SDK from `../../plugin/plugin-sdk`, and add it to `ENABLED_PLUGINS`:

```ts title="backend/src/plugin/plugins.config.ts"
import { ExcerptManifest, ExcerptModule } from '../plugins/excerpt';

export const ENABLED_PLUGINS = [
  { manifest: WordCountManifest, module: WordCountModule },
  { manifest: SeoAnalyzerManifest, module: SeoAnalyzerModule },
  { manifest: ExcerptManifest, module: ExcerptModule },
];
```

Bundled plugins are enabled on first start. They can import anything from the core, such as its `PrismaService` or its auth guards. They can't be deleted from the admin, and an upload can't use a bundled plugin's id.

## Testing it

1. Turn the plugin on under **Plugins** and save an entry. Changes from before-hooks show up in the entry's data in the API response.
2. Check the server log for lines from `Plugin:<id>` and for hook errors, which are logged with the plugin's id.
3. `GET /api/plugins/hooks` lists the events that have handlers.
