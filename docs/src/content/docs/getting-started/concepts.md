---
title: Core concepts
description: Content types, fields, entries, statuses, locales and API access — the ideas the rest of NodePress builds on.
sidebar:
  order: 5
---

## Content types

A **content type** defines one kind of content: `blog`, `product`, `team_member`, `faq`. It has a name and a **schema**, an ordered list of [fields](/content-modeling/fields/).

Every content type gets its own API endpoints as soon as it exists:

```text
GET /api/blog              list published entries
GET /api/blog/hello-world  one entry, by slug
```

Names are stored in `snake_case`. A content type named "Team Members" is stored as `team_members`, and its URL uses hyphens: `/api/team-members`. See [Content types](/content-modeling/content-types/).

## Fields

A **field** is one value an entry holds: a title, a price, an image, a list of FAQ items. Each field has a type (one of 15) and options such as **Required**. A field's **key** is its name in `snake_case`; that's the property name in the API.

Fields can contain fields: a **group** holds one fixed set, a **repeater** holds a list of rows, and a **flexible** field holds a list of blocks that can each use a different layout. They nest up to three levels deep. See [Nested fields](/content-modeling/nested-fields/).

Sets of fields you use in several content types can be defined once as a [component](/content-modeling/components/). Option lists you reuse (countries, departments) can be defined once as a [choice list](/content-modeling/choice-lists/).

## Entries

An **entry** is one piece of content of a content type: one post, one product. All of an entry's field values are stored together as JSON under `data`:

```json
{
  "id": "8c0f8e6e-5b1a-4a39-9d62-0f3c2b6a1d44",
  "slug": "hello-world",
  "locale": "en",
  "data": { "title": "Hello world", "body": "<p>My first post.</p>" },
  "seo": null,
  "createdAt": "2026-10-26T09:00:00.000Z",
  "updatedAt": "2026-10-26T09:00:00.000Z"
}
```

- **`slug`** is the entry's address, unique within its content type and language. It's generated from the first text field, and you can edit it. When a slug changes, NodePress can add a redirect from the old address.
- **`id`** is a permanent UUID. It never changes, which is why [relations](/content-modeling/relations/) point at it instead of the slug.
- Every save keeps a **version**, so you can restore an earlier one.
- Deleting an entry moves it to the **trash** first.

## Status

An entry's status decides who can see it:

| Status | Meaning | In the public API |
|---|---|---|
| `draft` | Work in progress | Hidden |
| `pending_review` | Submitted by a contributor, waiting for an editor | Hidden |
| `staging` | Ready, visible on a staging site | Only with `?stage=staging` and credentials |
| `published` | Live | Visible to everyone |
| `archived` | Retired | Hidden |

A draft can be scheduled to publish itself at a set time. A **release** publishes, unpublishes or archives a batch of entries together, now or on a schedule.

Reading anything other than published content (`?stage=draft`, `staging` or `all`) needs a login token or an API key.

## Languages

A site can have several content languages. Translations of an entry share its slug and differ by `locale`: `/api/blog/hello-world?locale=fr`. With `?fallback=true`, a missing translation falls back to the default language.

## API access

| Who | Can |
|---|---|
| Anyone | Read published entries of public content types |
| An **API key** (`X-API-Key` header) | Read, write, or both, for chosen content types |
| A **signed-in user** (`Authorization: Bearer <token>`) | Whatever their role allows |

Each content type chooses which public endpoints it offers (list, read, create, update, delete), and can be made fully private. Fields can be restricted to certain roles for reading or writing.

## Roles

Users have one of four built-in roles, or a custom role based on one of them:

| Role | Typically |
|---|---|
| `admin` | Everything, including users, settings and content type changes |
| `editor` | Creates, edits and publishes content |
| `contributor` | Writes drafts and submits them for review |
| `viewer` | Reads content in the admin |

Permissions can be adjusted per role and content type under **Users → Permissions**.
