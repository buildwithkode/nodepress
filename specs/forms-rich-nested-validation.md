# Spec: Headless Forms — Rich Nested Types + Declarative Validation

Status: **Approved (decisions locked)** · Owner: TBD · Last updated: 2026-06-24

## 1. Summary

Extend the **Forms** feature so a public, headless form can accept a **structured
payload** (typed scalars, arrays, nested objects, arrays-of-objects) and validate it
against a **declarative, opt-in rule set** defined per field.

"Headless" means NodePress does **not** render the form UI. It owns:
- the **contract** — the field schema (types, nesting, rules) authored in the admin builder, and
- the **gatekeeper** — `POST /api/forms/:slug/submit`, which validates the JSON the client
  sends, coerces it to typed values, persists it, and fires actions.

The client (the user's own frontend) builds the inputs and POSTs JSON.

### Goals
- Accept nested/structured submissions without flattening them to strings.
- Let form authors attach optional validation rules to any field.
- Keep existing flat forms working unchanged (full backward compatibility).
- Be safe to expose publicly (guardrails against abuse).

### Non-goals (v1)
- Rendering the public form UI (stays headless).
- `file`/`image` upload fields (a client sends a `url` string; real uploads go through the media module).
- Scriptable/JS-expression validation or full JSON-Schema (declarative rule object only).
- Cross-field / conditional rules (`required-if`) — possible later.

## 2. Motivating payload

The form must accept and validate this shape:

```json
{
  "name": "Karthik",
  "age": 29,
  "salary": 50000.50,
  "isActive": true,
  "country": "India",
  "email": "leo9karthik@gmail.com",
  "skills": ["React", "NextJS"],
  "address": { "city": "Mumbai", "pincode": 400001 },
  "avatar": "https://example.com/avatar.jpg",
  "documents": [
    { "name": "Resume", "url": "https://example.com/resume.pdf" }
  ],
  "joiningDate": "2026-06-24",
  "lastLogin": "2026-06-24T12:30:00Z",
  "manager": null
}
```

Field-to-type mapping:

| Payload key | Field type | Notes |
|---|---|---|
| `name`, `country` | `text` | |
| `age` | `number` | integer (validation: `integer: true`) |
| `salary` | `number` | float allowed |
| `isActive` | `boolean` | |
| `email` | `email` | |
| `skills` | `multiselect` or `tags` | array of strings |
| `address` | `group` | nested object, sub-fields `city`, `pincode` |
| `avatar` | `url` | string (file deferred) |
| `documents` | `repeater` | array of objects, sub-fields `name`, `url` |
| `joiningDate` | `date` | |
| `lastLogin` | `datetime` | |
| `manager` | any | nullable |

## 3. Field schema

### 3.1 Field types (v1)

| Group | Types |
|---|---|
| Scalars | `text`, `textarea`, `number`, `email`, `url`, `phone`, `date`, `datetime`, `boolean` |
| Choice | `select`, `radio`, `multiselect`, `tags` |
| Nested | `group` (object), `repeater` (array of objects) |

Deferred: `file`, `image`, `json`, `rating`, `slider`, `switch`, `password`.

### 3.2 `FormField` (evolved)

```ts
interface FormField {
  name: string;                 // snake_case key in submission data
  type: FieldType;
  label: string;
  placeholder?: string;

  // choice types
  options?: string[];           // select | radio | multiselect

  // nested types
  fields?: FormField[];         // group | repeater (recursive)

  // validation (all optional; omit = no rules beyond type coercion)
  validation?: FieldValidation;
}

interface FieldValidation {
  required?: boolean;           // replaces the old top-level `required`
  // numbers & dates
  min?: number | string;        // number min, or ISO date min
  max?: number | string;
  integer?: boolean;            // number must be an integer
  // strings
  minLength?: number;
  maxLength?: number;
  pattern?: string;             // RegExp source; tested with `new RegExp(pattern)`
  // arrays (multiselect | tags | repeater)
  minItems?: number;
  maxItems?: number;
  // shared
  message?: string;             // custom error text override
}
```

**Backward compatibility:** the legacy top-level `required: boolean` is still read.
A migration/normalizer folds it into `validation.required`. A field with neither
`fields` nor `validation` behaves exactly as today.

## 4. Coercion & validation engine

Replaces the current flat `validate()` / `coerce()` in `submission.service.ts` with a
**recursive, type-preserving** walk.

### 4.1 Coercion rules (per leaf type)

| Type | Accepts | Stored as |
|---|---|---|
| `text`, `textarea` | string | trimmed string |
| `email` | string | lowercased; must match email regex |
| `url` | string | string; must be a valid URL |
| `phone` | string | string; default pattern or author `pattern` |
| `number` | number or numeric string | `Number`; rejects `NaN`; `integer` enforced if set |
| `boolean` | `true/false/"true"/"false"/1/0/"1"/"0"` | boolean |
| `date` | `YYYY-MM-DD` or ISO | normalized ISO date string |
| `datetime` | ISO 8601 | normalized ISO datetime string |
| `select`, `radio` | string | string; must be in `options` |
| `multiselect` | `string[]` | array; each item must be in `options` |
| `tags` | `string[]` | array of trimmed strings (freeform) |
| `group` | object | object; recurse into `fields` |
| `repeater` | object[] | array; recurse into `fields` for each item |

Empty (`undefined`/`null`/`""`) → stored as `null` unless `required`.

### 4.2 Order of operations (per submission)

1. Load form (404 if missing / inactive).
2. Honeypot check (`_honey`) — unchanged.
3. Captcha check (`captchaEnabled`) — unchanged.
4. **Guardrails** (see §5) — reject early on breach.
5. **Recursive validate + coerce** — build clean typed object, collect errors with paths.
6. Persist `FormSubmission`.
7. Fire actions (email/webhook) async — unchanged trigger, updated rendering (§6).

### 4.3 Error format

`400 Bad Request`:

```json
{
  "message": "Validation failed",
  "errors": [
    { "path": "age", "rule": "max", "message": "\"Age\" must be at most 120" },
    { "path": "address.pincode", "rule": "pattern", "message": "Invalid pincode" },
    { "path": "documents[0].url", "rule": "required", "message": "\"Url\" is required" }
  ]
}
```

Paths use dot notation for objects and `[i]` for array items.

## 5. Guardrails (public abuse protection)

Enforced before/within validation. Configured globally via env vars (no per-form override in v1); defaults:

| Guardrail | Default | Action on breach |
|---|---|---|
| Max nesting depth | 3 | 400 |
| Max array items per field | 100 | 400 |
| Max total fields (flattened) | 200 | 400 |
| Max payload size | 100 KB | 413 |
| Unknown keys | stripped | silently dropped (not stored) |

## 6. Ripple changes (required once nesting ships)

1. **Email action** (`actions/`): `{{path}}` templating must resolve dot/`[i]` paths
   (`{{address.city}}`, `{{documents.0.url}}`); arrays/objects rendered readably
   (e.g. JSON or joined list), never `[object Object]`.
2. **Submissions viewer** (admin `forms/[id]/submissions`): render nested/array values
   as collapsible JSON or a nested list.
3. **CSV export**: `group` objects flatten to dot-path columns (`address.city`); `repeater`
   arrays-of-objects go into a **single JSON-string column** (per resolved decision §9.4).
4. **Builder UI** (`FormBuilder.tsx`): add new type options, a nested sub-field editor
   for `group`/`repeater` (borrow patterns from the content-type builder), and a
   collapsible "Validation" panel per field. (Builder is admin-only; not the public form.)

## 7. Phasing

- **Phase 1 — Engine + schema (backend). ✅ DONE.** Evolved `FormField`
  (`form-field.types.ts`), recursive validate/coerce engine (`submission-validator.ts`)
  wired into `submission.service.ts`, env guardrails (`FORM_MAX_*` in `config/env.ts` +
  `.env.example`), dot/[i] error paths, legacy `required` + `checkbox` back-compat.
  18 unit tests in `submission-validator.spec.ts` cover the §2 payload, every rule,
  and every guardrail. *Outcome:* a form defined via API/seed validates the full
  nested payload at `POST /api/submit/:slug`.
- **Phase 2 — Builder UI (admin). ✅ DONE.** Shared field model/helpers
  (`field-types.ts`), a recursive `FieldEditor.tsx` (new types in the dropdown,
  group/repeater nested sub-field editor capped at `MAX_BUILDER_DEPTH`, and a
  per-field collapsible validation panel), `FormBuilder.tsx` refactored to use it
  with recursive normalize, and the edit page hydrating nested fields. Docs (in-app
  Form Field Types table + website) updated.
- **Phase 3 — Ripples.** Email templating, submissions viewer, CSV export.

## 8. Backward compatibility & migration

- Existing forms (flat, top-level `required`) keep working with no data migration.
- A normalizer maps legacy `required` → `validation.required` on read; writes use the
  new shape.
- New field types are additive; no DB schema change (fields/submissions are JSON).

## 9. Resolved decisions (2026-06-24)

1. **Array-of-strings types:** ship **both** `multiselect` (fixed `options`) and `tags` (freeform).
2. **Guardrails:** **global, via env vars** only (no per-form override in v1). See §5.
3. **Date storage:** **normalize to canonical ISO** (`date` → `YYYY-MM-DD`, `datetime` → ISO 8601);
   reject input that isn't a real date. See §4.1.
4. **CSV export of `repeater`:** **single JSON column** holding the array as a JSON string
   (not flattened per-index columns). See §6.
