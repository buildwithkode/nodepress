---
title: Conditional fields
description: Show a field only when another field has a certain value.
sidebar:
  order: 7
---

A condition shows a field only when a sibling field matches. A `video_url` field can appear only when `media_type` is `video`, or a `discount_code` only when `has_discount` is on.

In the content type editor, open a field's settings and use **Show only if…**. In a schema, add a `condition`:

```json
{
  "name": "video_url",
  "type": "text",
  "required": true,
  "condition": { "field": "media_type", "op": "eq", "value": "video" }
}
```

## Operators

| `op` | Shows the field when the other field… | `value` |
|---|---|---|
| `eq` | equals `value` | a string, number or boolean |
| `ne` | doesn't equal `value` | a string, number or boolean |
| `in` | is one of the values | an array |
| `notIn` | is none of the values | an array |
| `set` | is filled in | none |
| `notSet` | is empty | none |

A multi-select field matches when **any** of its chosen values matches.

```jsonc
// Only for paid plans
{ "field": "plan", "op": "in", "value": ["pro", "business"] }

// Only once a cover image is chosen
{ "field": "cover", "op": "set" }

// Only when the "has_discount" switch is on
{ "field": "has_discount", "op": "eq", "value": true }
```

## Rules

- **Siblings only.** A condition compares fields on the same level: top-level fields with each other, or the fields of the same repeater row, group or flexible block.
- **Hidden fields aren't required.** `required: true` only applies while the field is shown, both in the admin and in the API.
- **Conditions chain.** A field whose condition field is hidden is hidden too.
- **Hidden isn't secret.** A condition only changes the form; the value is still stored and returned by the API. To restrict who can see or change a field, use `readRoles` and `writeRoles` ([Fields](/content-modeling/fields/#options-every-field-has)).
