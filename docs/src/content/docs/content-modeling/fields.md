---
title: Fields
description: The 15 field types, the options every field shares, and the value each one stores.
sidebar:
  order: 2
---

A content type's schema is a list of fields. Each field has a **name**, a **type** and optional settings. This page covers the simple types. [Repeaters, groups and flexible fields](/content-modeling/nested-fields/) hold other fields and have their own page.

## Field types

| Type | Admin input | Stored value |
|---|---|---|
| `text` | single-line input | `"My first post"` |
| `textarea` | multi-line input | `"A short summary…"` |
| `richtext` | WYSIWYG editor | `"<p>Hello <strong>world</strong></p>"` |
| `number` | number input | `42` or `9.99` |
| `boolean` | switch | `true` |
| `select` | dropdown | `"news"`, or `["news", "guides"]` when multiple |
| `image` | media picker | `{ "url": "https://…/photo.jpg", "alt": "A photo" }` |
| `color` | color picker | `"#ff6b35"` |
| `date` | date picker | `"2026-12-25"` |
| `datetime` | date and time picker | `"2026-12-25T10:30:00.000Z"` |
| `json` | JSON editor | any JSON value |
| `relation` | entry picker | an entry's ID, or a list of them ([Relations](/content-modeling/relations/)) |
| `repeater` | list of rows | `[{ … }, { … }]` ([Nested fields](/content-modeling/nested-fields/)) |
| `group` | fixed set of sub-fields | `{ … }` ([Nested fields](/content-modeling/nested-fields/)) |
| `flexible` | list of blocks, each with its own layout | `[{ "_layout": "hero", … }]` ([Nested fields](/content-modeling/nested-fields/)) |

## Options every field has

```json
{
  "name": "title",
  "label": "Title",
  "type": "text",
  "required": true,
  "description": "Shown on the page and in search results.",
  "indexed": true
}
```

| Option | What it does |
|---|---|
| `name` | The field's key in entry data. Normalized to `snake_case`: "Cover Image" becomes `cover_image`. Must be unique within its level. |
| `label` | What editors see. The admin keeps whatever you typed as the label. |
| `required` | The entry can't be saved without a value. |
| `description` | Help text under the input. |
| `indexed` | Adds a database index so filters on this field stay fast. See [Indexed fields](#indexed-fields). |
| `condition` | Shows the field only when another field matches. See [Conditional fields](/content-modeling/conditional-fields/). |
| `readRoles` / `writeRoles` | Restricts who can read or change the field, for example `["admin", "editor"]`. Others don't see it in API responses, and their writes to it are refused. |

## Type-specific options

Options go in an `options` object.

### Text, textarea, rich text

```json
{ "name": "headline", "type": "text",
  "options": { "minLength": 10, "maxLength": 80, "pattern": "^[A-Z]" } }
```

`pattern` is a regular expression without delimiters. It's checked by the server as well as the admin. Rich text is sanitized on save: scripts, event handlers and unsafe URLs are removed.

### Number

```json
{ "name": "price", "type": "number", "options": { "min": 0, "max": 10000, "integer": false } }
```

`integer: true` refuses decimals.

### Boolean

```json
{ "name": "featured", "type": "boolean", "options": { "defaultValue": false } }
```

### Select

```json
{ "name": "category", "type": "select",
  "options": { "choices": ["news", "guides", "releases"], "multiple": false } }
```

Entries store the value. With `multiple: true` they store a list of values. Instead of typing choices on every field, point several fields at one shared list with `"choiceList": "category"`. See [Choice lists](/content-modeling/choice-lists/).

### Image

Stores the URL of a file from the media library, or any external URL, plus alt text:

```json
"cover": { "url": "https://cms.example.com/uploads/1730000000000-3f2a9c1e.webp", "alt": "Our office" }
```

Entries created before alt text existed may hold a plain URL string, so read both forms. To get resized versions, use the media transform endpoint, or the JavaScript client's `imageUrl()` helper.

### Date and datetime

```json
{ "name": "event_date", "type": "date", "options": { "min": "2026-01-01", "max": "2026-12-31" } }
```

`date` stores `YYYY-MM-DD`. `datetime` stores an ISO 8601 timestamp in UTC.

### Color, JSON

`color` stores a hex value. `json` stores any JSON value as-is, for data that doesn't fit a schema.

## Indexed fields

Tick **Indexed** on a field (or send `"indexed": true`) to give it a database index. Filters on it, such as `?where[category][eq]=news` or `gt`/`lt` ranges, then stay fast with hundreds of thousands of entries instead of scanning every one.

```json
{ "name": "category", "type": "select", "indexed": true,
  "options": { "choices": ["news", "guides"] } }
```

```text
GET /api/blog?where[category][eq]=news
```

- Available on top-level `text`, `textarea`, `number`, `boolean`, `select`, `date`, `datetime`, `color` and `relation` fields.
- The index is built in the background when you save, so writes are never blocked. Unticking the box drops it.
- Each index adds a little work to every save, so index only the fields you filter on.

## Field keys must be unique

Two fields at the same level can't share a key. The content type editor marks a duplicate key and won't save until you rename one. Keys are compared after normalization, so `Title` and `title` clash.
