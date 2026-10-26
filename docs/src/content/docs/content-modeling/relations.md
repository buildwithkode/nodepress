---
title: Relations
description: Link entries across content types, resolve them with ?populate=, add two-way links and filter by related fields.
sidebar:
  order: 4
---

A `relation` field links an entry to entries of another (or the same) content type: a post to its author, a product to its categories, an article to related articles.

## Defining a relation

```json
{
  "name": "author",
  "type": "relation",
  "options": { "relatedContentType": "author", "cardinality": "one" }
}
```

| Option | Values | Meaning |
|---|---|---|
| `relatedContentType` | a content type name | what the field links to |
| `cardinality` | `one` or `many` | one linked entry, or a list |

In the entry editor, a relation field is a searchable picker of the related type's entries.

## What gets stored

A relation stores the linked entries' **IDs**, the permanent UUIDs that don't change when a slug does:

```json
{ "author": "550e8400-e29b-41d4-a716-446655440000" }

{ "categories": ["9b2d7c1e-…", "4f6a0b3d-…"] }
```

## Resolving with `?populate=`

By default the API returns the IDs. Add `?populate=` to get the linked entries inline:

```bash
GET /api/post/my-post?populate=author
GET /api/post/my-post?populate=author,categories
```

```jsonc
{
  "id": "…",
  "slug": "my-post",
  "data": {
    "title": "My post",
    "author": {
      "publicId": "550e8400-e29b-41d4-a716-446655440000",
      "slug": "jane-doe",
      "locale": "en",
      "status": "published",
      "data": { "name": "Jane Doe", "bio": "…" },
      "contentType": { "id": 3, "name": "author", "displayName": "Authors" }
      // …plus id, seo, createdAt and updatedAt
    }
  }
}
```

Linked entries can be resolved further with dot paths, up to three levels:

```bash
# the post's author, and the author's company
GET /api/post/my-post?populate=author,author.company

# three levels
GET /api/post/my-post?populate=author,author.company,author.company.address
```

- A linked entry's UUID is in `publicId`; its `id` there is the internal numeric ID.
- Each level costs one batched database query, however many entries link.
- Public requests only include **published** linked entries.
- A linked entry's fields are filtered by **its own** content type's read permissions, as if you'd fetched it directly.
- Responses with `?populate=` aren't cached, because their shape depends on the request.
- `?populate=` resolves top-level relation fields only. A relation inside a repeater, group or flexible block stays as IDs.

## Two-way relations

To list a post's author on the post *and* an author's posts on the author, add a **reverse field** to the author type. It points at the forward field with `mappedBy`:

```json title="author schema"
{
  "name": "posts",
  "type": "relation",
  "options": { "relatedContentType": "post", "cardinality": "many", "mappedBy": "author" }
}
```

A reverse field stores nothing. It lists the entries whose forward field points at this one, so the two sides can never disagree. In the editor, pick **Reverse of** in the field's options; the forward field must already exist.

```bash
GET /api/author/jane-doe?populate=posts          # Jane's published posts
GET /api/author?populate=posts,posts.categories  # and onwards from there
```

- Reverse fields are read-only. Writing to one is refused with `422`.
- They return the newest 100 linked entries per entry.
- Renaming the forward field updates the reverse fields that point at it.

## Filtering by related fields

`where` can filter on a linked entry's own fields, one level deep:

```bash
GET /api/post?where[author][slug][eq]=jane-doe
GET /api/post?where[author.name][eq]=Jane%20Doe          # dot notation, same thing
GET /api/post?where[categories][label][in]=News,Guides   # many: any linked entry matches
GET /api/post?where[author][eq]=550e8400-e29b-…          # compare the stored ID
```

The filter first finds the matching linked entries (at most 1,000), then the entries that point at them. If more than 1,000 could match, narrow the filter.

## In GraphQL

GraphQL resolves relation fields to the related type automatically, including reverse fields, so you select the related fields you want instead of using `populate`.
