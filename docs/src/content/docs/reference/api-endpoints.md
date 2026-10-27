---
title: API endpoints
description: Every static REST endpoint of the NodePress backend, grouped by area, with method, path, who can call it and what it does.
sidebar:
  order: 2
---

This page lists the backend's fixed REST endpoints: the ones the admin uses to manage content, users and settings. Paths are relative to `https://<your-backend>`. All of them start with `/api`, except GraphQL and uploaded files.

For the endpoints generated for each content type (`/api/{type}`), see [Content API](#content-api) below and [REST API](/apis/rest/). The interactive Swagger UI at `/api/docs` documents every request and response body.

## Authentication

The **Auth** column says who can call an endpoint:

| Value | Meaning |
|---|---|
| Public | No credentials needed. |
| Signed in | A JWT access token (`Authorization: Bearer <token>`) for a user of any role. |
| Role names | A JWT for a user whose role has access to the route's module. The names are the roles that have it by default; admins can change that per role on the [permissions](/access-control/permissions/) page. Reads need **View**, changes **Edit**. |
| Admin | A JWT for an admin. Most of these belong to a module (API keys, webhooks, jobs, settings, …) that only admins have by default, and can be opened to other roles on the [permissions](/access-control/permissions/) page. Roles, permissions, plugin packages, restart and permanent delete stay admin-only. |

Entry routes also check the role's [permissions](/access-control/permissions/) for the content type, so a role listed here can still get 403 for a type it has no rights on. A few routes accept an [API key](/access-control/api-keys/) (`X-API-Key`), as noted.

Every route is rate-limited to 120 requests per minute per IP unless noted. API-key requests have their own [per-key limits](/access-control/api-keys/).

## Content API

Generated for every content type. `{type}` is the content type name (`blog_post` is served at `/api/blog-post`; the underscore form works too).

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/{type}` | Public (published); credentials for other stages | List entries with filters, search, sorting, paging and `?populate=` |
| GET | `/api/{type}/{slug}` | Public (published); credentials for other stages | One entry by slug |
| GET | `/api/{type}/{slug}/preview` | `?token=` preview token | A draft entry, for live preview. Tokens come from `POST /api/entries/:id/preview-url` and last 1 hour. |
| POST | `/api/{type}` | JWT or write/all API key | Create an entry |
| PUT | `/api/{type}/{slug}` | JWT or write/all API key | Update an entry |
| DELETE | `/api/{type}/{slug}` | JWT or write/all API key | Move an entry to the trash |

Details: [REST API](/apis/rest/) and [Querying](/apis/querying/).

## Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/setup-status` | Public | Whether initial setup is still needed (no users yet) |
| POST | `/api/auth/register` | Public | Create the first admin account. Only works while there are no users. 5/min. |
| POST | `/api/auth/login` | Public | Sign in: returns an access token and sets the refresh cookie. 10/min in production. |
| POST | `/api/auth/refresh` | Refresh cookie | New access token; rotates the refresh token |
| POST | `/api/auth/logout` | Refresh cookie | Invalidate the refresh token and clear the cookie |
| GET | `/api/auth/me` | Signed in | The current user, with `access: { modules, content }` |
| POST | `/api/auth/2fa/verify-login` | Public | Finish signing in with a 6-digit code or a recovery code. 10/min. |
| GET | `/api/auth/2fa/status` | Signed in | Whether two-factor authentication is on |
| GET | `/api/auth/2fa/setup` | Signed in | New TOTP secret, QR code and recovery codes |
| POST | `/api/auth/2fa/enable` | Signed in | Verify a code and turn 2FA on |
| POST | `/api/auth/2fa/disable` | Signed in | Turn 2FA off with a code |
| POST | `/api/auth/forgot-password` | Public | Email a password reset link (always returns 200). 5/min in production. |
| POST | `/api/auth/reset-password` | Public | Set a new password with a reset or invitation token. 5/min in production. |
| GET | `/api/auth/oidc/config` | Public | Whether SSO is on, and the provider name for the login button |
| GET | `/api/auth/oidc/login` | Public | Start single sign-on (redirects to the identity provider) |
| GET | `/api/auth/oidc/callback` | Public | Identity provider callback |
| POST | `/api/auth/oidc/exchange` | Public | Swap the one-time SSO code for a session |

See [Authentication](/access-control/authentication/) and [Single sign-on](/access-control/sso/).

## Content types

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/content-types` | Public view, or signed in for all | List content types. Anonymous callers get only types open to the public API, without `readRoles` fields or `previewUrl` |
| POST | `/api/content-types` | Admin | Create a content type |
| GET | `/api/content-types/export` | admin, editor, or an API key with `all` access to `*` | Export content types, components and choice lists as JSON |
| POST | `/api/content-types/import` | Admin, or an API key with `all` access to `*` | Import an export bundle (`dryRun` only reports) |
| GET | `/api/content-types/:id` | Public view, or signed in for all | One content type (anonymous: 404 for a type closed to the public API) |
| GET | `/api/content-types/:id/form` | Signed in | The form structure generated from its fields |
| PUT | `/api/content-types/:id` | Admin | Update a content type, optionally with field data migrations |
| POST | `/api/content-types/:id/schema-impact` | Admin | Preview what an update would do to existing entries |
| GET | `/api/content-types/:id/schema-history` | Admin | Schema version history |
| DELETE | `/api/content-types/:id` | Admin | Delete a content type and all its entries |

See [Content types](/content-modeling/content-types/) and [Schema changes](/content-modeling/schema-changes/). The CLI's [schema sync](/cli/schema/) uses export and import.

## Components and choice lists

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/components` | Signed in | List components with the fields that use them |
| GET | `/api/components/:id` | Signed in | One component and its usage |
| POST | `/api/components` | Admin | Create a component |
| PUT | `/api/components/:id` | Admin | Update a component and every content type that uses it |
| DELETE | `/api/components/:id` | Admin | Delete a component (409 while it's used) |
| GET | `/api/choice-lists?names=a,b` | Public | The named lists |
| GET | `/api/choice-lists` | Admin | Every list with its usage |
| GET | `/api/choice-lists/:name` | Public | One list |
| POST | `/api/choice-lists` | Admin | Create a list |
| PUT | `/api/choice-lists/:id` | Admin | Update a list and every field that uses it |
| DELETE | `/api/choice-lists/:id` | Admin | Delete a list (409 while it's used) |

See [Components](/content-modeling/components/) and [Choice lists](/content-modeling/choice-lists/).

## Entries

The admin's entry API. Entries are addressed by numeric ID here, not by slug.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/entries` | Signed in | List entries, with paging and search |
| POST | `/api/entries` | admin, editor, contributor | Create an entry |
| GET | `/api/entries/counts` | Signed in | Entry counts and pending-review counts per content type |
| GET | `/api/entries/export` | admin, editor | Export a content type's entries as JSON or CSV |
| POST | `/api/entries/import` | admin, editor | Import entries from JSON or CSV (`dryRun` only reports) |
| POST | `/api/entries/bulk-delete` | admin, editor | Move entries to the trash |
| POST | `/api/entries/bulk-publish` | admin, editor | Publish entries |
| POST | `/api/entries/bulk-archive` | admin, editor | Archive entries |
| POST | `/api/entries/bulk-pending-review` | admin, editor, contributor | Submit entries for review |
| POST | `/api/entries/bulk-stage` | admin, editor | Move entries to staging |
| POST | `/api/entries/bulk-promote` | admin, editor | Move entries to a given status |
| GET | `/api/entries/:id` | Signed in | One entry |
| PUT | `/api/entries/:id` | admin, editor, contributor | Update an entry (saves a version first) |
| DELETE | `/api/entries/:id` | admin, editor | Move an entry to the trash |
| POST | `/api/entries/:id/restore` | admin, editor | Restore an entry from the trash |
| DELETE | `/api/entries/:id/purge` | Admin | Delete a trashed entry permanently |
| POST | `/api/entries/:id/translate` | admin, editor, contributor | Create (or get) the entry's translation in a locale |
| POST | `/api/entries/:id/promote` | admin, editor, contributor | Move an entry to the next workflow stage |
| POST | `/api/entries/:id/preview-url` | admin, editor, contributor | Create a 1-hour preview token |
| GET | `/api/entries/:id/versions` | Signed in | Version history (up to 50 most recent) |
| POST | `/api/entries/:id/versions/:versionId/restore` | admin, editor | Restore a version (saves the current one first) |

See [Entries](/content/entries/) and [Versions](/content/versions/).

## Releases

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/releases` | Signed in | List releases |
| GET | `/api/releases/:id` | Signed in | A release with its entries and conflicts with other releases |
| POST | `/api/releases` | admin, editor | Create a release |
| PATCH | `/api/releases/:id` | admin, editor | Rename or describe a release |
| DELETE | `/api/releases/:id` | admin, editor | Delete a release (its entries are not touched) |
| POST | `/api/releases/:id/items` | admin, editor | Add entries with an action: `publish`, `unpublish` or `archive` |
| DELETE | `/api/releases/:id/items/:itemId` | admin, editor | Remove an entry from a release |
| PUT | `/api/releases/:id/schedule` | admin, editor | Publish at `scheduledAt` (`null` unschedules) |
| POST | `/api/releases/:id/publish` | admin, editor | Publish now, in one transaction |

See [Releases](/content/releases/).

## Media

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/media` | Signed in | List media files (`page`, `limit`, `folderId`; `folderId=null` for unfiled) |
| POST | `/api/media/upload` | admin, editor | Upload a file (`multipart/form-data`) |
| DELETE | `/api/media/:filename` | admin, editor | Delete a file and its WebP copy |
| GET | `/api/media/:filename/transform` | Public | Resized or converted image, cached. `/resize` is an alias. |
| PUT | `/api/media/:filename/focal-point` | admin, editor | Set or clear the focal point for cover crops |
| PUT | `/api/media/:filename/folder` | admin, editor | Move a file into a folder (`folderId: null` for the root) |
| GET | `/api/media/folders` | Signed in | List folders (flat, with `parentId`) |
| POST | `/api/media/folders` | admin, editor | Create a folder |
| PUT | `/api/media/folders/:id` | admin, editor | Rename a folder |
| DELETE | `/api/media/folders/:id` | admin, editor | Delete a folder and its sub-folders (files become unfiled) |

Uploaded files themselves are served at `/uploads/<filename>` with local storage. See [Media](/content/media/).

## Languages, SEO and redirects

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/locales` | Public | Enabled content languages and the default |
| GET | `/api/locales/usage` | admin, editor | Number of entries per locale |
| PUT | `/api/locales` | Admin | Set the enabled languages and the default |
| GET | `/api/sitemap.xml` | Public | XML sitemap of published entries |
| GET | `/api/robots.txt` | Public | robots.txt |
| GET | `/api/redirects/resolve?path=` | Public | Look up a redirect: `{ to, statusCode }`, or 404 |
| GET | `/api/redirects` | admin, editor | List redirects (`search`, `page`, `limit`, `sort`) |
| POST | `/api/redirects` | admin, editor | Create a redirect |
| PATCH | `/api/redirects/:id` | admin, editor | Change a redirect |
| DELETE | `/api/redirects/:id` | admin, editor | Delete a redirect |
| GET | `/api/redirects/export` | admin, editor | All redirects as CSV |
| POST | `/api/redirects/import` | admin, editor | Import CSV rows, all or nothing (`dryRun` only reports) |

See [Languages](/content/languages/), [SEO](/content/seo/) and [Redirects](/content/redirects/).

## Forms

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/submit/:slug` | Public | Submit a form. 20/min per IP. |
| GET | `/api/forms` | admin, editor | List forms with submission counts |
| POST | `/api/forms` | admin, editor | Create a form |
| GET | `/api/forms/:id` | admin, editor | One form |
| PUT | `/api/forms/:id` | admin, editor | Update a form |
| DELETE | `/api/forms/:id` | admin, editor | Delete a form and its submissions |
| GET | `/api/forms/:id/submissions` | admin, editor | A form's submissions, paginated |
| GET | `/api/forms/submissions/recent` | admin, editor | The 6 most recent submissions across all forms |

See [Forms](/content/forms/).

## Templates, import and AI

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/templates` | Admin | Starter templates |
| POST | `/api/templates/:id/apply` | Admin | Create a template's content types and, by default, its sample entries |
| POST | `/api/import/wordpress` | Admin | Import a WordPress export (WXR, up to 50 MB). `?dryRun=true` only reports; otherwise queues a job. |
| GET | `/api/import/wordpress/:jobId` | Admin | Status, progress and result of an import job |
| GET | `/api/ai/status` | Signed in | Whether AI help is configured |
| POST | `/api/ai/content-model` | Admin | Suggest a content type from a description (not saved). 10/min. |
| POST | `/api/ai/draft` | admin, editor, contributor | Draft field values for an entry (not saved). 20/min. |

See [Templates](/content/templates/), [WordPress import](/content/wordpress-import/) and [AI assistance](/content/ai/).

## Users, roles and permissions

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users` | Admin, or Users → View | List users |
| POST | `/api/users` | Admin, or Users → Edit | Invite a user (email and role, no password) |
| PUT | `/api/users/:id/role` | Admin, or Users → Edit | Change a user's role |
| DELETE | `/api/users/:id` | Admin, or Users → Edit | Delete a user (not yourself or the last admin) |
| POST | `/api/users/:id/invite` | Admin, or Users → Edit | Resend the invitation |
| PUT | `/api/users/me/password` | Signed in | Change your own password |
| GET | `/api/roles` | Admin, or Users → View | Built-in and custom roles with user counts |
| GET | `/api/roles/access` | Admin | Module list and every role's module levels |
| PUT | `/api/roles/access/:role` | Admin | Set a role's module levels: `{ modules: { forms: "view" } }` |
| POST | `/api/roles` | Admin | Create a custom role based on editor, contributor or viewer |
| PUT | `/api/roles/:name` | Admin | Change a custom role's label, description or base role |
| DELETE | `/api/roles/:name` | Admin | Delete a custom role (409 while users have it) |
| GET | `/api/permissions` | Admin | All permission rows |
| GET | `/api/permissions/:role` | Admin | A role's permissions |
| PUT | `/api/permissions/:role/:contentType` | Admin | Set a role's allowed actions on a content type (`*` for all types) |
| DELETE | `/api/permissions/:role/:contentType` | Admin | Remove an override, so the role falls back to its `*` row |
| PUT | `/api/permissions/reset/all` | Admin | Reset all module levels and content permissions to the defaults |

See [Users and roles](/access-control/users-and-roles/) and [Permissions](/access-control/permissions/).

## API keys, webhooks and audit log

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/api-keys` | Admin | List API keys |
| POST | `/api/api-keys` | Admin | Create an API key |
| DELETE | `/api/api-keys/:id` | Admin | Revoke an API key |
| GET | `/api/webhooks` | Admin | List webhooks |
| POST | `/api/webhooks` | Admin | Create a webhook |
| PATCH | `/api/webhooks/:id` | Admin | Update a webhook |
| PATCH | `/api/webhooks/:id/toggle` | Admin | Turn a webhook on or off |
| POST | `/api/webhooks/:id/ping` | Admin | Send a test ping |
| DELETE | `/api/webhooks/:id` | Admin | Delete a webhook |
| GET | `/api/webhooks/deliveries` | Admin | Delivery log, including failed deliveries |
| POST | `/api/webhooks/deliveries/:id/retry` | Admin | Deliver a past payload again |
| GET | `/api/audit-log` | Admin | Audit log entries (`resource`, `page`, `limit` up to 100) |

See [API keys](/access-control/api-keys/), [Webhooks](/apis/webhooks/) and [Audit log](/access-control/audit-log/).

## Plugins

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/plugins` | admin, editor | Plugins with their on/off state (settings for admins only) |
| GET | `/api/plugins/hooks` | admin, editor | Registered hooks and filters |
| GET | `/api/plugins/:id` | admin, editor | One plugin |
| PATCH | `/api/plugins/:id/toggle` | Admin | Turn a plugin on or off |
| PUT | `/api/plugins/:id/config` | Admin | Save a plugin's settings |
| POST | `/api/plugins/packages` | Admin | Upload a plugin zip (`?dryRun=true` only checks it). Takes effect after a restart. |
| DELETE | `/api/plugins/packages/:id` | Admin | Delete an uploaded plugin (it must be off). Takes effect after a restart. |
| POST | `/api/plugins/restart` | Admin | Restart the server to load plugin changes (returns 202) |
| GET | `/api/plugins/registry` | Admin | Plugins in the plugin directory (`?refresh=true` to refetch it) |
| POST | `/api/plugins/registry/:id/install` | Admin | Download, verify and install a listed plugin (`?dryRun=true` only reviews it) |

See [Plugins](/extending/plugins/).

## Settings and operations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/brand` | Public | The install's name, logo and colors |
| PUT | `/api/brand` | Admin | Update the brand |
| GET | `/api/server-settings` | Admin | Email and storage settings (secrets are never returned) |
| PUT | `/api/server-settings/mail` | Admin | Save SMTP settings (applies immediately) |
| POST | `/api/server-settings/mail/test` | Admin | Send a test email. 5/min. |
| PUT | `/api/server-settings/storage` | Admin | Save storage settings (applies after a restart) |
| POST | `/api/server-settings/storage/test` | Admin | Write and delete a test object in the bucket. 10/min. |
| GET | `/api/search/status` | Admin | Which search engine answers `?search=` |
| POST | `/api/search/reindex` | Admin | Rebuild the external search index in the background |
| GET | `/api/jobs` | Admin | Background jobs with status counts |
| POST | `/api/jobs/retry-failed` | Admin | Requeue all failed jobs (`?type=` for one type) |
| POST | `/api/jobs/:id/retry` | Admin | Run a failed job again |
| DELETE | `/api/jobs/:id` | Admin | Delete a finished job |
| GET | `/api/health` | Public | Health check: database, cache, storage and memory |
| GET | `/api/metrics` | Public, or `Bearer <METRICS_TOKEN>` when set | Prometheus metrics |
| GET | `/api/openapi.json` | Public | OpenAPI 3.1 document for the content API |

See [Monitoring](/deployment/monitoring/) and [OpenAPI](/apis/openapi/).

## Other paths

| Path | What it is |
|---|---|
| `/graphql` | GraphQL endpoint (no `/api` prefix). See [GraphQL](/apis/graphql/). |
| `/api/docs` | Swagger UI for the whole REST API |
| `/api/docs/content` | Swagger UI for the content API, generated from your content types |
| `/uploads/<filename>` | Uploaded files, with local storage |
| `/api/realtime` | Socket.io endpoint (namespace `/realtime`). See [Real-time events](/apis/realtime/). |
