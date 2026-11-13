# NodePress integration guide for Next.js

> **For AI coding assistants (Claude Code, Cursor, Codex…) and developers.** Put this file in the root of a Next.js project: as `CLAUDE.md` for Claude Code, `AGENTS.md` for other assistants. **If the project already has one of those files, append this guide to it instead of replacing it**, and keep the existing instructions (frameworks often generate their own, such as Next.js's `AGENTS.md`). It contains everything needed to connect the project to a NodePress CMS. Source: https://nodepress-docs.vercel.app/apis/ai-agents/

**Scope:** Next.js App Router (13.4+, including 15 and 16). For the Pages Router, the same API applies: fetch in `getStaticProps`/`getServerSideProps` and use `res.revalidate()` in the webhook route.

## 1. What NodePress is

NodePress is a self-hosted headless CMS. Editors manage content in the NodePress admin; this project only **reads** that content over HTTP (and posts form submissions). There is no SDK lock-in: everything is plain REST under `<CMS_URL>/api`.

- A **content type** is a model (`blog_post`, `page`, `team_member`). Its fields are its schema.
- An **entry** is one item of a content type, addressed by its **slug** (and **locale** on multi-language sites).
- Published entries are **public**: reading them needs no API key.
- Content type names are snake_case (`team_member`). In URLs, use hyphens: `/api/team-member` (the underscore form also works).

## 2. Rules for the assistant

Follow these whenever you touch NodePress code in this project:

1. **Never guess field names.** Read the real content model first (section 4) and use the exact field keys it returns. If the CMS can't be reached, ask the user for a sample entry instead of inventing one. **Forms can't be discovered through the public API**: ask the user for each form's slug and field keys (the NodePress form builder shows them in its payload preview). If they aren't known yet, build the form with clearly marked `TODO` keys and say so.
2. **Never put a write or all-access API key in client code** (browser bundles, `NEXT_PUBLIC_*`, `VITE_*`, `EXPO_PUBLIC_*`, mobile apps). Published content needs no key. A key is only for server-side code that reads drafts or writes entries.
3. **Treat the CMS as optional at runtime.** A failed request must not crash a page: return `null`/an empty list, log it, and render a fallback or a not-found state.
4. **A missing entry is a 404, not an error.** `GET /api/:type/:slug` answers `404` for a slug that doesn't exist or isn't published.
5. **Rich text is HTML.** Sanitize it before rendering, even though NodePress sanitizes on save.
6. **Keep one small CMS module** (a client plus typed helpers) and call it from pages/components. Don't scatter `fetch` calls to the CMS across the codebase.
7. **Type the data.** Write TypeScript interfaces for each content type's `data`, from the real schema (or use generated types, section 11).
8. **Don't change the CMS from this project** (content types, forms, webhooks). Tell the user what to change in the NodePress admin instead.

## 3. Information to ask the user for

| What | Example | Used for |
|---|---|---|
| CMS URL | `https://cms.example.com` | every request (`<CMS_URL>/api/...`) |
| Which content types and slugs map to which pages/screens | `page` → `/[slug]`, `blog_post` → `/blog/[slug]` | routing |
| Form slugs, if the project has forms | `contact-us` | `POST /api/submit/<slug>` |
| Where media is hosted, if not on the CMS itself | an R2 / S3 / ImageKit URL | image allow-lists |
| API key (only if drafts or writes are needed, server-side only) | `np_…` | `X-API-Key` header |

## 4. Discover the content model (do this first)

Two public endpoints describe the content model. Run them and read the output before writing any code:

```bash
# Every public content type with its fields (name, type, label, options, required)
curl -s <CMS_URL>/api/content-types

# OpenAPI 3 description of every public endpoint, with request/response schemas from the fields
curl -s <CMS_URL>/api/openapi.json

# One real entry, to see actual values
curl -s "<CMS_URL>/api/<type>?limit=1"
```

- `schema` is the list of fields. Each field has `name` (the key in `data`), `type`, `label`, `required`, and `options` (choices, layouts, sub-fields, relation target).
- `allowedMethods` tells you what the public API allows for that type. `null` means the defaults: public reads allowed. Types the public can't read aren't listed.
- Select fields copy their labels into the schema: `options.choices` (values) and `options.choiceLabels` (labels, same order). Use those for display; `options.choiceList` names the shared option list they came from.
- `openapi.json` is large (hundreds of KB). Filter it, e.g. `curl -s <CMS_URL>/api/openapi.json | jq '.paths | keys'`.
- Container fields (`group`, `repeater`, `flexible`) have nested fields in `options` (sub-fields, or `layouts[].fields`), up to three levels deep.

## 5. Endpoints this project uses

All under `<CMS_URL>/api`. Reads are `GET`, public, and return JSON.

| Endpoint | Returns |
|---|---|
| `GET /api/:type` | a list: `{ data: Entry[], meta }` |
| `GET /api/:type/:slug` | one entry, or `404` |
| `GET /api/:type/:slug/preview?token=…` | a draft for live preview (token from the editor, valid 1 hour) |
| `POST /api/submit/:formSlug` | a form submission (public) |
| `GET /api/option-lists/:name` | a shared list of choices `{ name, label, choices }` |
| `GET /api/option-lists?names=a,b` | several lists at once (up to 50) |
| `GET /api/locales` | `{ locales: string[], defaultLocale }` |
| `GET /api/redirects/resolve?path=/old` | `{ to, statusCode }` or `404` |
| `GET /api/media/:file/transform?w=800` | a resized copy of an image stored on the CMS |
| `GET /api/sitemap.xml`, `GET /api/robots.txt` | generated sitemap and robots file |
| `GET /api/content-types` | the public content model (section 4) |

### The entry shape

```json
{
  "id": "8c0f8e6e-5b1a-4a39-9d62-0f3c2b6a1d44",
  "slug": "hello-world",
  "locale": "en",
  "data": { "title": "Hello world", "cover": { "url": "https://…/photo.jpg", "alt": "" }, "body": "<p>…</p>" },
  "seo": { "title": "…", "description": "…", "ogImage": "…", "canonical": "…", "noIndex": false },
  "createdAt": "2026-10-26T09:00:00.000Z",
  "updatedAt": "2026-10-26T09:00:00.000Z"
}
```

- `id` is a permanent UUID (the **publicId**). It survives slug changes, and relation fields store it.
- `seo` may be `null`.
- A list is `{ "data": [ …entries ], "meta": { "total", "page", "limit", "totalPages", "nextCursor" } }`.

### Field values in `data`

| Field type | Value |
|---|---|
| `text`, `textarea` | string |
| `richtext` | HTML string: sanitize before rendering |
| `number` | number |
| `boolean` | boolean |
| `select` | string, or string[] when `options.multiple` is true |
| `image` | `{ "url": "https://…", "alt": "…" }` (older data may be a plain URL string; handle both) |
| `relation` | publicId string (`cardinality: "one"`) or string[] (`"many"`); full entries with `?populate=` |
| `color` | `"#1a2b3c"` |
| `date` | `"2026-12-25"` |
| `datetime` | ISO timestamp in UTC, `"2026-12-25T10:30:00.000Z"` |
| `json` | any JSON |
| `group` | an object of its sub-fields |
| `repeater` | an array of objects (rows) |
| `flexible` | an ordered array of sections, each `{ "_id", "_layout": "<layout name>", …fields }` and maybe `_key` |

Any field may be missing or `null`. Always render defensively (`data.title ?? ''`).

Keys starting with `_` are not fields:

- `_id` is on every repeater row and flexible section. Use it as the React key.
- `_layout` and `_key` are on flexible sections (section 7).
- Other `_`-prefixed keys (`_word_count`, `_reading_time_minutes`, `_seo_score`, `_seo_suggestions`…) are added by NodePress plugins. Ignore them unless the user wants them (a reading time, for example), and don't add them to your types as required.

### Query parameters for lists

| Parameter | Example | Does |
|---|---|---|
| `where[field][op]=value` | `where[featured][eq]=true` | filter; ops `eq ne gt gte lt lte in notIn contains startsWith endsWith`; also on `slug`, `locale`, `createdAt`, `updatedAt` |
| `where[OR][0][a][eq]=x&where[OR][1][b][eq]=y` | | OR / AND groups |
| `where[relation][field][eq]=v` | `where[author][slug][eq]=jane` | filter by a related entry's field |
| `sort` | `sort=createdAt:desc` | only `createdAt`, `updatedAt`, `slug`; `asc`/`desc` |
| `page`, `limit` | `page=2&limit=12` | `limit` 1–100, default 20 |
| `cursor` | from `meta.nextCursor` | fast keyset paging; no `total` in this mode |
| `search` | `search=yoga retreat` | full-text search; ignores `where` and `sort` |
| `fields` | `fields=title,cover` | only these `data` keys |
| `populate` | `populate=author,author.company` | inline relations, up to 3 levels |
| `locale`, `fallback` | `locale=fr&fallback=true` | language; fallback fills gaps with the default language |
| `byKey` | `byKey=true` | adds `data.<flexible>_by_key`: sections by `_key` (or layout name when used once) |

`where` only filters top-level fields. Single-entry reads take `locale`, `fallback`, `fields`, `populate` and `byKey`.

Responses with `populate` or `fields` are never cached by the CMS; use them where they save real work.

## 6. The client package (recommended)

`@nodepress-cms/client` is a small, dependency-free, typed wrapper around the REST API. It only needs `fetch`, so it works in Node 18+, browsers, edge runtimes and React Native.

```bash
npm install @nodepress-cms/client
```

```ts
import { createClient, NodePressError } from '@nodepress-cms/client';

const cms = createClient({ url: CMS_URL }); // a trailing /api is fine

const { data, meta } = await cms.collection('blog_post').list({
  where: { featured: { eq: true } },
  sort: 'createdAt:desc',
  limit: 10,
  populate: ['author'],
});

const post = await cms.collection('blog_post').get('hello-world'); // null on 404

await cms.submitForm('contact-us', { name: 'Asha', email: 'asha@example.com' });

const thumb = cms.imageUrl(post?.data.cover, { w: 800, format: 'auto' }); // CMS-stored images only; others returned unchanged
const langs = await cms.locales();
```

- Errors other than a 404 on `get()` throw `NodePressError` with `.status` and `.body`.
- `createClient({ url, fetch })` takes a custom `fetch`; use it to add framework cache options.
- `cms.collection(type).all(query)` is an async generator over every matching entry (for sitemaps and static builds).
- Typed: `createClient<NodePressContentTypes>({ url })` with generated types (section 11) types `list()`/`get()` per content type.
- `byKey` is an option of the client from version 1.9. With an older version, request it directly: `cms.request('GET', '/page/home?byKey=true')`.
- Plain `fetch` works just as well if you prefer no dependency. Build the query string with `toQueryString()` from the package, or by hand as in section 5.

## 7. Flexible sections (page builders)

A `flexible` field is a list of sections, each with a `_layout`. Render them with a registry, not a long if/else:

```tsx
type Section = { _id: string; _layout: string; [field: string]: unknown };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each layout has its own props
const SECTIONS: Record<string, React.ComponentType<any>> = {
  hero: HeroSection,
  text_block: TextSection,
  gallery: GallerySection,
};

export function Sections({ sections }: { sections?: Section[] | null }) {
  return (
    <>
      {(sections ?? []).map((section) => {
        const Component = SECTIONS[section._layout];
        if (!Component) return null; // a layout this site doesn't render yet
        return <Component key={section._id} {...section} />;
      })}
    </>
  );
}
```

- Use `_id` as the React key, never the array index.
- Unknown layouts are skipped silently (log in development), so editors adding a new layout don't break the page.
- To reach one specific section (e.g. "the contact block"), read the entry with `byKey=true` and use `data.<field>_by_key.<key>`.

## 8. Images

- Image fields hold an absolute URL. It can point at the CMS (`<CMS_URL>/uploads/…`) or at external storage (R2, S3, ImageKit, a CDN).
- For images stored on the CMS, `GET <CMS_URL>/api/media/<file>/transform?w=800&h=600&fit=cover&format=auto&q=80` returns a resized copy (cached for a year). `cms.imageUrl()` builds that URL and returns any other URL unchanged.
- Always render `alt` from the field (`image.alt`), with an empty string as the fallback.
- Read the host(s) from real data (section 4) and configure the framework's image allow-list for them.

## 9. Forms

Forms are built in the NodePress admin; the project only submits them.

```ts
const res = await fetch(`${CMS_URL}/api/submit/contact-us`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { full_name, email, message, _honey }, captchaToken }),
});
```

| Status | Meaning | What to show |
|---|---|---|
| `201` | stored: `{ success: true, submissionId, message }` | success message |
| `400` | validation failed / form inactive / captcha failed: `{ message, errors: [{ path, rule, message }] }` | each `errors[i].message` next to the field `path` |
| `404` | no form with that slug | generic error; tell the developer |
| `413` | submission too large (default 100 KB) | "too large" |
| `429` | more than 20 submissions per minute from this IP | "please wait a moment" |

- Keys in `data` are the form's field keys. They can't be read from the public API: ask the user (rule 1). Unknown keys are dropped silently, so a wrong key looks like an empty field.
- **Honeypot**: include a hidden, empty `_honey` field. Bots fill it; NodePress then returns success without storing anything.
- **Captcha** (only if the form has it enabled): render the provider's widget (Turnstile, hCaptcha or reCAPTCHA) with its site key and send the token as `captchaToken`.
- **File fields**: send `multipart/form-data` with `data` as a JSON string and the file under the field's key. Allowed: pdf/doc/docx by default, max 10 MB.

```ts
const body = new FormData();
body.append('data', JSON.stringify({ full_name, email }));
body.append('resume', file);
await fetch(`${CMS_URL}/api/submit/career-application`, { method: 'POST', body }); // no Content-Type header: the browser sets the boundary
```

- The browser calls the CMS directly, so the site's origin must be listed in the CMS's `CORS_ORIGIN` (native React Native apps aren't affected by CORS). A production CMS doesn't allow `http://localhost:*` unless it's listed there too, so testing forms from a local dev server against a live CMS needs that entry.

## 10. Option lists, languages, redirects, SEO

- **Option lists** are shared choices (departments, countries…): `GET /api/option-lists/<name>` → `{ name, label, choices: [{ value, label? }] }`. Use them to render select inputs and filter chips with labels.
- **Languages**: `GET /api/locales` gives the site's languages. Pass `locale` on every read; add `fallback=true` to fill missing translations with the default language. Entries in different languages share a slug.
- **Redirects**: editors manage redirects in the CMS. Before rendering a 404, ask `GET /api/redirects/resolve?path=<path>`: `{ to, statusCode }` → redirect; `{ to: null, statusCode: 410 }` → gone; `404` → no redirect.
- **SEO**: use `entry.seo` (`title`, `description`, `ogImage`, `canonical`, `noIndex`) for page metadata, falling back to the entry's own title/excerpt. The CMS generates `/api/sitemap.xml` and `/api/robots.txt` for its own URLs; most sites generate their own sitemap from `cms.collection(type).all()`.

## 11. TypeScript types

Write an interface per content type's `data` from the schema (section 4):

```ts
export interface BlogPostData {
  title: string;
  excerpt?: string | null;
  body?: string | null;              // richtext HTML
  cover?: { url: string; alt?: string } | null;
  author?: string | AuthorEntry | null; // publicId, or the entry with populate=author
}
```

If the user has the NodePress project itself, `npx create-nodepress-app generate:types --out types/nodepress.d.ts` (run in the NodePress project, it reads the database) writes every interface plus `NodePressContentTypes`; copy the file here and pass it to `createClient<NodePressContentTypes>()`. Regenerate whenever content types change.

## 12. Errors and status codes

| Status | Meaning |
|---|---|
| `200`/`201` | ok |
| `304` | not modified (`If-None-Match` ETag still matches) |
| `400` | bad parameter (slug, cursor, locale) |
| `401` | credentials required (drafts, `stage=`) or invalid |
| `403` | operation disabled on this content type, or key doesn't cover it |
| `404` | content type or entry doesn't exist / isn't published |
| `422` | write data failed validation |
| `429` | rate limit: 120 requests/minute per IP; respect `Retry-After` |

Errors are JSON: `{ "statusCode", "message", "error" }`.

## 13. Security rules

- Published reads need **no credentials**. Don't add an API key "just in case".
- A key in client code is public. Only `read` keys may ever be considered for that, and even then prefer no key.
- Draft/preview reads and writes run **server-side only**, with the key in a server-only env variable.
- Sanitize rich text (and anything from live preview) before rendering it as HTML.
- Preview tokens are short-lived and single-entry; still, never log them.
- Verify webhook signatures (`X-NodePress-Signature: sha256=<hex HMAC of the raw body>`) before acting on a webhook.

## 14. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Browser console: blocked by CORS | the site's origin isn't in the CMS's `CORS_ORIGIN` | add the exact origin (`https://www.example.com`, no slash) on the CMS and restart it |
| `404` for a type that exists | content type URL uses underscores/case wrong, or the entry isn't published | use `/api/<type-with-hyphens>`; publish the entry |
| `403` on a read | the content type's public `read`/`list` is turned off | enable it under API Endpoints in the content type editor |
| Field is `undefined` | wrong key, or the entry has no value | check the schema (section 4); handle missing values |
| Relation is a UUID string | not populated | add `populate=<field>` |
| Images don't load | host not allowed by the framework, or wrong URL | add the host to the image allow-list (see the framework section) |
| Form returns `400` | field keys don't match the form, a required field is empty, or captcha missing | show `errors[]`; check the form's field keys in the admin |
| `429` | over 120 requests/min from one IP (often a build hammering the API) | cache reads, lower concurrency, use `limit=100` |

---

# Next.js implementation

## N1. Environment variables

```bash
# .env.local (and the same names in Vercel → Settings → Environment Variables)
NODEPRESS_URL=https://cms.example.com          # server-side reads
NEXT_PUBLIC_NODEPRESS_URL=https://cms.example.com   # only if the browser calls the CMS (forms)
NODEPRESS_REVALIDATE_SECRET=<long random string>    # must equal the CMS webhook's secret
NODEPRESS_API_KEY=                               # optional, server-only: drafts/writes. Never NEXT_PUBLIC_
NODEPRESS_ADMIN_URL=https://cms.example.com      # optional: live preview (the admin's origin)
```

If the project already uses other names (e.g. `CMS_API_URL`), keep them; don't rename working variables.

## N2. The CMS module: `lib/nodepress.ts`

Read content in **Server Components** (or route handlers), never from client components, so pages are rendered with content, cached, and work for SEO.

First check the Next.js version (`package.json`) and whether `cacheComponents: true` (Next 16) is set in `next.config`. Pick **one** of the two caching styles below and use it everywhere.

### Style A: fetch cache tags (Next 13.4–16, without `cacheComponents`)

```ts
// lib/nodepress.ts
import 'server-only'; // npm i server-only
import { createClient, type Entry, type ListQuery, type ListResult, type ReadOptions } from '@nodepress-cms/client';

export const NODEPRESS_TAG = 'nodepress';

export const cms = createClient({
  url: process.env.NODEPRESS_URL!,
  fetch: (input, init) =>
    fetch(input, { ...init, next: { revalidate: 300, tags: [NODEPRESS_TAG] } }),
});

/** One published entry, or null when it doesn't exist or the CMS can't be reached. */
export async function getEntry<T>(type: string, slug: string, opts: ReadOptions = {}): Promise<Entry<T> | null> {
  try {
    return (await cms.collection(type).get(slug, opts)) as Entry<T> | null;
  } catch (err) {
    console.error(`NodePress: ${type}/${slug}`, err);
    return null;
  }
}

/** A list of published entries; empty when the CMS can't be reached. */
export async function listEntries<T>(type: string, query: ListQuery = {}): Promise<ListResult<Entry<T>>> {
  try {
    return (await cms.collection(type).list(query)) as ListResult<Entry<T>>;
  } catch (err) {
    console.error(`NodePress: list ${type}`, err);
    return { data: [], meta: { limit: 0 } };
  }
}
```

### Style B: `'use cache'` (Next 16 with `cacheComponents: true`)

```ts
// lib/nodepress.ts
import 'server-only'; // npm i server-only
import { cacheLife, cacheTag } from 'next/cache';
import { createClient, type Entry, type ListResult } from '@nodepress-cms/client';

export const NODEPRESS_TAG = 'nodepress';
export const cms = createClient({ url: process.env.NODEPRESS_URL! });

/** One published entry, or null when it doesn't exist or the CMS can't be reached. */
export async function getEntry<T>(type: string, slug: string, locale?: string, populate?: string): Promise<Entry<T> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(NODEPRESS_TAG);
  try {
    return (await cms.collection(type).get(slug, { locale, populate: populate?.split(',') })) as Entry<T> | null;
  } catch (err) {
    console.error(`NodePress: ${type}/${slug}`, err);
    return null;
  }
}

/** A page of published entries; empty when the CMS can't be reached. */
export async function listEntries<T>(type: string, limit = 20, page = 1, locale?: string): Promise<ListResult<Entry<T>>> {
  'use cache';
  cacheLife('minutes');
  cacheTag(NODEPRESS_TAG);
  try {
    return (await cms.collection(type).list({ limit, page, locale })) as ListResult<Entry<T>>;
  } catch (err) {
    console.error(`NodePress: list ${type}`, err);
    return { data: [], meta: { limit: 0 } };
  }
}
```

Add more helpers (filters, sorting) the same way, with plain arguments. In Style B, the page examples below call `getEntry(type, slug)` and `listEntries(type, 100)` instead of passing option objects.

`cms.collection(type).all()` (sitemap, N9) isn't cached by itself; call it from a `'use cache'` function too.

Arguments of a `'use cache'` function are part of its cache key, so pass plain values (strings, numbers), not objects with functions.

## N3. Pages

```tsx
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getEntry, listEntries } from '@/lib/nodepress';
import { sanitize } from '@/lib/sanitize';
import type { BlogPostData } from '@/types/nodepress';

type Props = { params: Promise<{ slug: string }> }; // Next 15+: params is a Promise

export async function generateStaticParams() {
  const { data } = await listEntries<BlogPostData>('blog_post', { limit: 100, fields: ['title'] });
  return data.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getEntry<BlogPostData>('blog_post', (await params).slug);
  if (!post) return {};
  return {
    title: post.seo?.title || post.data.title,
    description: post.seo?.description || post.data.excerpt || undefined,
    openGraph: post.seo?.ogImage ? { images: [post.seo.ogImage] } : undefined,
    robots: post.seo?.noIndex ? { index: false } : undefined,
    alternates: post.seo?.canonical ? { canonical: post.seo.canonical } : undefined,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const post = await getEntry<BlogPostData>('blog_post', (await params).slug);
  if (!post) notFound();
  return (
    <article>
      <h1>{post.data.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: sanitize(post.data.body) }} />
    </article>
  );
}
```

- On Next 13/14, `params` is a plain object: `{ params }: { params: { slug: string } }`.
- **Check the not-found status code.** Run `curl -I https://<site>/blog/does-not-exist`. With `cacheComponents` (Next 16), the page can be streamed before `notFound()` runs, so a missing slug gets the not-found page with **HTTP 200** (Next adds a `noindex` tag, so search engines still skip it). If the user needs a real 404 status, check the slug against `generateStaticParams`' list, or look the slug up in middleware/proxy and return a 404 there. Tell the user which one you chose.
- `fields` in `generateStaticParams` keeps that list request small (the response is then not cached by the CMS, which is fine at build time).

### Rich text sanitizing: `lib/sanitize.ts`

```ts
import sanitizeHtml from 'sanitize-html'; // npm i sanitize-html @types/sanitize-html

export function sanitize(html?: string | null): string {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'figure', 'figcaption', 'u', 's', 'mark']),
    allowedAttributes: { a: ['href', 'name', 'target', 'rel'], img: ['src', 'alt', 'title', 'width', 'height', 'loading'], '*': ['class'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  });
}
```

Add `serverExternalPackages: ['sanitize-html']` to `next.config` (Next 15+) so it stays out of the bundler (it's in the N4 example).

## N4. Images: `next.config`

`next/image` only loads remote hosts listed in `images.remotePatterns`. Add the CMS host and every media host found in real data.

**Merge this into the existing `next.config`; don't replace it.** Keep settings the project already has (`cacheComponents`, `experimental`, `turbopack`…). A complete example with everything this guide adds:

```ts
// next.config.ts
const cms = new URL(process.env.NODEPRESS_URL ?? 'http://localhost:3000');
const mediaHosts = (process.env.NODEPRESS_MEDIA_URLS ?? '') // e.g. "https://pub-xxxx.r2.dev,https://ik.imagekit.io/acme"
  .split(',').map((s) => s.trim()).filter(Boolean).map((u) => new URL(u));

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // cacheComponents: true,              // keep whatever the project already had
  serverExternalPackages: ['sanitize-html'], // N3
  images: {
    remotePatterns: [
      { protocol: cms.protocol.replace(':', '') as 'http' | 'https', hostname: cms.hostname, port: cms.port, pathname: '/uploads/**' },
      { protocol: cms.protocol.replace(':', '') as 'http' | 'https', hostname: cms.hostname, port: cms.port, pathname: '/api/media/**' },
      ...mediaHosts.map((u) => ({ protocol: u.protocol.replace(':', '') as 'http' | 'https', hostname: u.hostname, pathname: `${u.pathname.replace(/\/+$/, '')}/**` })),
    ],
  },
};
export default nextConfig;
```

```tsx
import Image from 'next/image';
{post.data.cover?.url && (
  <Image src={post.data.cover.url} alt={post.data.cover.alt ?? ''} width={1200} height={630} sizes="(max-width: 768px) 100vw, 1200px" />
)}
```

- In local development the CMS is on `localhost`; Next 16 refuses local image hosts unless `images.dangerouslyAllowLocalIP` is `true`. Set it only when `NODE_ENV === 'development'`.
- `next.config` is read at build time: after changing image hosts, redeploy.

## N5. Instant updates: the revalidate webhook

Without this, pages update only when the cache expires. With it, publishing in the CMS refreshes the site within seconds.

```ts
// app/api/revalidate/route.ts
import { createHmac, timingSafeEqual } from 'crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { NODEPRESS_TAG } from '@/lib/nodepress';

export async function POST(request: Request) {
  const secret = process.env.NODEPRESS_REVALIDATE_SECRET;
  if (!secret) return NextResponse.json({ revalidated: false, message: 'secret not set' }, { status: 500 });

  // The signature covers the raw body: read it as text before parsing.
  const body = await request.text();
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const received = Buffer.from(request.headers.get('x-nodepress-signature') ?? '');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return NextResponse.json({ revalidated: false, message: 'Invalid signature' }, { status: 401 });
  }

  revalidateTag(NODEPRESS_TAG, 'max'); // Next 16. On Next 13–15: revalidateTag(NODEPRESS_TAG)
  return NextResponse.json({ revalidated: true });
}
```

Then the **user** creates the webhook in the NodePress admin (Developer → Webhooks → New):

| Setting | Value |
|---|---|
| URL | `https://<site domain>/api/revalidate` |
| Events | `*` (all), or at least `entry.created`, `entry.updated`, `entry.deleted`, `entry.published` |
| Secret | the same value as `NODEPRESS_REVALIDATE_SECRET` |

Check it: `curl -X POST https://<site>/api/revalidate -d '{}'` must answer `401 Invalid signature` (route live, secret set). After publishing an entry, the webhook's delivery log in the admin should show `200`.

One tag for all content is simplest and right for most sites. For very large sites, tag per content type (`nodepress:blog_post`) and read `contentType` from the webhook body (`{ event, timestamp, data: { contentType, slug } }`).

## N6. Forms (client component)

```tsx
'use client';
import { useState } from 'react';

const CMS = process.env.NEXT_PUBLIC_NODEPRESS_URL!;

export function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setErrors({});
    const form = new FormData(e.currentTarget);
    const res = await fetch(`${CMS}/api/submit/contact-us`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: Object.fromEntries(form) }), // includes the empty _honey
    }).catch(() => null);
    if (res?.status === 201) return setStatus('sent');
    const body = await res?.json().catch(() => null);
    setErrors(Object.fromEntries((body?.errors ?? []).map((er: { path: string; message: string }) => [er.path, er.message])));
    setStatus('error');
  }

  return (
    // Field names = the form's field keys, from the user (rule 1). Example keys:
    <form onSubmit={onSubmit}>
      <input name="full_name" required />
      {errors.full_name && <p role="alert">{errors.full_name}</p>}
      <input name="email" type="email" required />
      <textarea name="message" required />
      {/* honeypot: hidden from people, filled by bots */}
      <input name="_honey" tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true" />
      <button disabled={status === 'sending'}>Send</button>
      {status === 'sent' && <p>Thanks! We'll be in touch.</p>}
    </form>
  );
}
```

The browser calls the CMS directly, so the site's origin(s) must be in the CMS's `CORS_ORIGIN`, including `www.` and the `*.vercel.app` preview address if used. To avoid CORS entirely you can post to your own route handler (`app/api/contact/route.ts`) and forward to the CMS from the server. The CMS then sees every submission as coming from your server's IP, so they all share one rate limit (20 per minute); posting directly from the browser is usually better.

## N7. Redirects from the CMS (optional)

```ts
// middleware.ts (Next 16: proxy.ts with `export function proxy`)
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname + req.nextUrl.search;
  const res = await fetch(`${process.env.NODEPRESS_URL}/api/redirects/resolve?path=${encodeURIComponent(path)}`);
  if (!res.ok) return NextResponse.next();
  const { to, statusCode } = await res.json();
  if (statusCode === 410) return new NextResponse('Gone', { status: 410 });
  return NextResponse.redirect(new URL(to, req.url), statusCode);
}

export const config = { matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'] };
```

This adds one cached lookup per page view. On busy sites, call it only from `app/not-found.tsx` paths instead.

## N8. Draft mode and live preview (optional)

Needs `NODEPRESS_ADMIN_URL`, HTTPS in production, and the content type's **Preview URL** set in the CMS to:

```text
https://<site>/api/draft?token={token}&slug={slug}&locale={locale}
```

```ts
// app/api/draft/route.ts
import { cookies, draftMode } from 'next/headers';
import { redirect } from 'next/navigation';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const token = p.get('token'), slug = p.get('slug'), locale = p.get('locale') ?? 'en';
  if (!token || !slug) return new Response('Missing token or slug', { status: 400 });

  const check = await fetch(
    `${process.env.NODEPRESS_URL}/api/blog_post/${encodeURIComponent(slug)}/preview?token=${encodeURIComponent(token)}&locale=${locale}`,
    { cache: 'no-store' },
  );
  if (!check.ok) return new Response('Invalid or expired preview token', { status: 401 });

  (await draftMode()).enable();
  const prod = process.env.NODE_ENV === 'production';
  (await cookies()).set('nodepress_preview_token', token, {
    httpOnly: true, path: '/', maxAge: 3600, sameSite: prod ? 'none' : 'lax', secure: prod, // the admin frames the site
  });
  redirect(`/blog/${encodeURIComponent(slug)}`); // only ever redirect to your own paths
}
```

- In the page: if `(await draftMode()).isEnabled`, read the token cookie and fetch `/api/<type>/<slug>/preview?token=…` with `cache: 'no-store'` instead of the cached read.
- Add `app/api/disable-draft/route.ts` that calls `(await draftMode()).disable()` and redirects home.
- For as-you-type updates, render the entry in a client component and use `onPreviewUpdate(cb, { adminOrigin: process.env.NEXT_PUBLIC_NODEPRESS_ADMIN_URL })` and `enableClickToEdit({ adminOrigin })` from `@nodepress-cms/client/preview`; add `data-np-field="<field key>"` to rendered elements. Sanitize HTML from `update.data` in the browser.
- Don't send `X-Frame-Options: DENY`; if a CSP sets `frame-ancestors`, include the admin origin.
- A complete working example: `starters/nextjs` in https://github.com/buildwithkode/nodepress.

## N9. Sitemap

```ts
// app/sitemap.ts
import type { MetadataRoute } from 'next';
import { cms } from '@/lib/nodepress';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = 'https://www.example.com';
  const urls: MetadataRoute.Sitemap = [{ url: site }];
  for await (const post of cms.collection('blog_post').all({ fields: ['title'] })) {
    urls.push({ url: `${site}/blog/${post.slug}`, lastModified: post.updatedAt });
  }
  return urls;
}
```

## N10. Step-by-step checklist (do these in order)

1. Ask for the CMS URL; run the three discovery commands (section 4) and note the content types, field keys and media hosts.
2. `npm install @nodepress-cms/client sanitize-html` (+ `@types/sanitize-html`).
3. Add the env variables (N1) to `.env.local` and `.env.example`.
4. Create `lib/nodepress.ts` (N2, choosing style A or B) and `lib/sanitize.ts` (N3).
5. Write `types/nodepress.ts` with an interface per content type used (section 11).
6. Build pages as Server Components with `notFound()` and `generateMetadata` (N3); flexible fields through a section registry (section 7).
7. Configure `images.remotePatterns` (N4).
8. Add `app/api/revalidate/route.ts` (N5) and tell the user the webhook settings to create.
9. Add forms (N6) and tell the user to put the site's origin(s) in the CMS's `CORS_ORIGIN`.
10. Optional: redirects (N7), preview (N8), sitemap (N9).
11. Run `npx tsc --noEmit` and `npm run build`; open the pages locally against the CMS.
12. Give the user the deployment list:
    - Vercel env variables: `NODEPRESS_URL`, `NEXT_PUBLIC_NODEPRESS_URL`, `NODEPRESS_REVALIDATE_SECRET`, media URLs; then redeploy.
    - CMS: `CORS_ORIGIN` includes the site's domain(s); the revalidate webhook points at the production domain with the same secret.
    - Test: publish an edit → page updates in seconds and the webhook log shows `200`; submit a form → it appears under Forms → Submissions.
