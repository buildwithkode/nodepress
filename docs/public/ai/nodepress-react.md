# NodePress integration guide for React (Vite, Create React App, React Router)

> **For AI coding assistants (Claude Code, Cursor, Codex…) and developers.** Put this file in the root of a React project: as `CLAUDE.md` for Claude Code, `AGENTS.md` for other assistants. **If the project already has one of those files, append this guide to it instead of replacing it**, and keep the existing instructions (frameworks often generate their own, such as Next.js's `AGENTS.md`). It contains everything needed to connect the project to a NodePress CMS. Source: https://nodepress-docs.vercel.app/apis/ai-agents/

**Scope:** client-rendered React apps (Vite, CRA, React Router, TanStack Router). Everything runs in the browser, so **no secrets** can live in this project. For a site that needs SEO on every page, a server-rendered framework (Next.js, Remix, Astro) is a better fit; tell the user if SEO matters.

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

# React implementation

## R1. Environment variables

```bash
# .env (Vite reads VITE_*; Create React App reads REACT_APP_*)
VITE_NODEPRESS_URL=https://cms.example.com
```

Every `VITE_*` value is baked into the public JavaScript bundle. Never add an API key here: published content needs none, and a key in the bundle is public.

## R2. Allow the site's origin on the CMS (CORS)

The browser calls the CMS directly, so the CMS must allow the site's origin. The **user** adds it to `CORS_ORIGIN` on the CMS server (comma separated, exact origins, no trailing slash) and restarts the CMS:

```text
CORS_ORIGIN=https://cms.example.com,https://www.example.com,https://example.com
```

A CMS running in development mode (`NODE_ENV` not `production`, e.g. `npm run dev` on the user's computer) allows any `http://localhost:*` origin automatically, so Vite's dev server works against it without changes. A production CMS only allows the origins in `CORS_ORIGIN`, so to develop locally against it, the user adds `http://localhost:5173` there too.

## R3. The CMS module: `src/lib/nodepress.ts`

```ts
import { createClient, NodePressError, type Entry, type ListQuery, type ListResult } from '@nodepress-cms/client';

export const cms = createClient({ url: import.meta.env.VITE_NODEPRESS_URL });

export async function getEntry<T>(type: string, slug: string, locale?: string): Promise<Entry<T> | null> {
  return (await cms.collection(type).get(slug, { locale })) as Entry<T> | null; // null on 404
}

export async function listEntries<T>(type: string, query: ListQuery = {}): Promise<ListResult<Entry<T>>> {
  return (await cms.collection(type).list(query)) as ListResult<Entry<T>>;
}

export { NodePressError };
```

## R4. Fetching in components

### With TanStack Query (recommended when the project has it, or for more than a few pages)

```bash
npm install @tanstack/react-query
```

```tsx
// src/main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });
// <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
```

```tsx
// src/hooks/useEntry.ts
import { useQuery } from '@tanstack/react-query';
import { getEntry, listEntries } from '../lib/nodepress';
import type { ListQuery } from '@nodepress-cms/client';

export const useEntry = <T,>(type: string, slug: string | undefined, locale?: string) =>
  useQuery({ queryKey: ['nodepress', type, slug, locale], queryFn: () => getEntry<T>(type, slug!, locale), enabled: !!slug });

export const useEntries = <T,>(type: string, query: ListQuery = {}) =>
  useQuery({ queryKey: ['nodepress', type, 'list', query], queryFn: () => listEntries<T>(type, query) });
```

### Without a library

```tsx
// src/hooks/useEntry.ts
import { useEffect, useState } from 'react';
import { getEntry } from '../lib/nodepress';
import type { Entry } from '@nodepress-cms/client';

export function useEntry<T>(type: string, slug?: string) {
  const [state, setState] = useState<{ entry: Entry<T> | null; loading: boolean; error: unknown }>({ entry: null, loading: true, error: null });
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    getEntry<T>(type, slug)
      .then((entry) => !cancelled && setState({ entry, loading: false, error: null }))
      .catch((error) => !cancelled && setState({ entry: null, loading: false, error }));
    return () => { cancelled = true; };
  }, [type, slug]);
  return state;
}
```

### A page

```tsx
// src/pages/BlogPost.tsx
import { useParams } from 'react-router-dom';
import DOMPurify from 'dompurify'; // npm i dompurify
import { useEntry } from '../hooks/useEntry';
import type { BlogPostData } from '../types/nodepress';

export default function BlogPost() {
  const { slug } = useParams();
  const { data: post, isLoading, isError } = useEntry<BlogPostData>('blog_post', slug);

  if (isLoading) return <p>Loading…</p>;
  if (isError) return <p>Couldn't load this page. Please try again.</p>;
  if (!post) return <NotFound />;

  return (
    <article>
      <title>{post.seo?.title || post.data.title}</title> {/* React 19 hoists <title>/<meta> to <head> */}
      <meta name="description" content={post.seo?.description ?? post.data.excerpt ?? ''} />
      <h1>{post.data.title}</h1>
      {post.data.cover?.url && <img src={post.data.cover.url} alt={post.data.cover.alt ?? ''} loading="lazy" />}
      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.data.body ?? '') }} />
    </article>
  );
}
```

- Always handle the three states: loading, error, and `null` (not found).
- On React 18, set the title with `document.title` in an effect, or use `react-helmet-async`.

## R5. Images

Plain `<img>` loads any host; no allow-list is needed. For images stored on the CMS, request a resized copy instead of the original:

```tsx
<img
  src={cms.imageUrl(image, { w: 800, format: 'auto' })}
  srcSet={[400, 800, 1600].map((w) => `${cms.imageUrl(image, { w, format: 'auto' })} ${w}w`).join(', ')}
  sizes="(max-width: 768px) 100vw, 800px"
  alt={image?.alt ?? ''}
  loading="lazy"
/>
```

`cms.imageUrl()` returns R2/S3/ImageKit URLs unchanged; resize those with the provider's own URL parameters if needed.

## R6. Forms

```tsx
import { useState } from 'react';
import { cms, NodePressError } from '../lib/nodepress';

export function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; // keep it: currentTarget is null after the await
    setStatus('sending');
    setErrors({});
    try {
      await cms.submitForm('contact-us', Object.fromEntries(new FormData(form)));
      setStatus('sent');
      form.reset();
    } catch (err) {
      const list = err instanceof NodePressError ? ((err.body as any)?.errors ?? []) : [];
      setErrors(Object.fromEntries(list.map((x: { path: string; message: string }) => [x.path, x.message])));
      setStatus('error');
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <input name="full_name" required />
      {errors.full_name && <p role="alert">{errors.full_name}</p>}
      <input name="email" type="email" required />
      <textarea name="message" required />
      <input name="_honey" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }} />
      <button disabled={status === 'sending'}>Send</button>
      {status === 'sent' && <p>Thanks! We'll be in touch.</p>}
      {status === 'error' && !Object.keys(errors).length && <p role="alert">Something went wrong. Please try again.</p>}
    </form>
  );
}
```

For forms with a file field, use `fetch` with `FormData` as in section 9 (the client's `submitForm` sends JSON only).

## R7. Content updates

There's no server cache in a client-rendered app: each visitor fetches fresh content (the CMS caches published reads for 30–60 seconds). With TanStack Query, `staleTime: 60_000` avoids refetching on every navigation. No webhook is needed.

If the app is **pre-rendered** at build time (e.g. `vite-plugin-ssg`, React Router prerender), content changes need a rebuild: the user points a NodePress webhook at their host's deploy hook URL (Vercel/Netlify "Deploy Hooks").

## R8. Routing for CMS pages

```tsx
<Route path="/" element={<Home />} />            {/* e.g. getEntry('page', 'home') */}
<Route path="/blog" element={<BlogList />} />
<Route path="/blog/:slug" element={<BlogPost />} />
<Route path="/:slug" element={<CmsPage />} />    {/* generic pages from the `page` type, last */}
<Route path="*" element={<NotFound />} />
```

The host must serve `index.html` for every path (SPA fallback): Vercel/Netlify do this for Vite apps with a rewrite rule; add one if deep links 404.

## R9. Step-by-step checklist (do these in order)

1. Ask for the CMS URL; run the discovery commands (section 4) and note content types, field keys and media hosts.
2. `npm install @nodepress-cms/client dompurify` (+ `@tanstack/react-query` if used).
3. Add `VITE_NODEPRESS_URL` to `.env` and `.env.example`.
4. Create `src/lib/nodepress.ts` (R3) and the hooks (R4).
5. Write `src/types/nodepress.ts` with an interface per content type used (section 11).
6. Build pages with loading/error/not-found states (R4); flexible fields through a section registry (section 7); sanitize rich text.
7. Images with `alt` and, for CMS-stored ones, `cms.imageUrl()` sizes (R5).
8. Forms with honeypot and per-field errors (R6).
9. Routes and SPA fallback (R8).
10. Run `npx tsc --noEmit` and `npm run build`; open the app locally against the CMS.
11. Give the user the deployment list:
    - Host env variable `VITE_NODEPRESS_URL`, then rebuild (values are baked in at build time).
    - CMS: `CORS_ORIGIN` includes every domain the app is served from.
    - Test: pages load, images show, a form submission appears under Forms → Submissions.
