# NodePress integration guide for React Native (Expo and bare React Native)

> **For AI coding assistants (Claude Code, Cursor, Codex…) and developers.** Put this file in the root of a React Native project: as `CLAUDE.md` for Claude Code, `AGENTS.md` for other assistants. **If the project already has one of those files, append this guide to it instead of replacing it**, and keep the existing instructions (frameworks often generate their own, such as Next.js's `AGENTS.md`). It contains everything needed to connect the app to a NodePress CMS. Source: https://nodepress-docs.vercel.app/apis/ai-agents/

**Scope:** Expo (SDK 50+, Expo Router or React Navigation) and bare React Native 0.73+. An app bundle can be unpacked by anyone, so **no secrets** can live in it.

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

# React Native implementation

## M1. Environment variables

```bash
# .env (Expo reads EXPO_PUBLIC_* at build time)
EXPO_PUBLIC_NODEPRESS_URL=https://cms.example.com
```

For bare React Native, use `react-native-config` or a `config.ts` per build flavour. `EXPO_PUBLIC_*` values are inlined into the app bundle: never put an API key there.

### Reaching a local CMS during development

| Where the app runs | URL for a CMS on your computer at port 3000 |
|---|---|
| iOS simulator | `http://localhost:3000` |
| Android emulator | `http://10.0.2.2:3000` (the emulator's alias for your computer) |
| Physical device / Expo Go | `http://<your computer's LAN IP>:3000`, same Wi-Fi |

Release builds block plain `http://` (iOS App Transport Security, Android cleartext policy). Production must use the CMS's `https://` URL. CORS doesn't apply to native apps, so `CORS_ORIGIN` needs no change for them (it does for Expo **web**).

## M2. The CMS module: `src/lib/nodepress.ts`

`@nodepress-cms/client` only needs `fetch`, which React Native provides.

```ts
import { createClient, NodePressError, type Entry, type ListQuery, type ListResult } from '@nodepress-cms/client';

export const cms = createClient({ url: process.env.EXPO_PUBLIC_NODEPRESS_URL! });

export async function getEntry<T>(type: string, slug: string, locale?: string): Promise<Entry<T> | null> {
  return (await cms.collection(type).get(slug, { locale })) as Entry<T> | null;
}

export async function listEntries<T>(type: string, query: ListQuery = {}): Promise<ListResult<Entry<T>>> {
  return (await cms.collection(type).list(query)) as ListResult<Entry<T>>;
}

export { NodePressError };
```

## M3. Fetching with TanStack Query (recommended)

Mobile networks drop and apps go to the background; TanStack Query handles caching, retries, refetch on focus and pull-to-refresh.

```bash
npx expo install @tanstack/react-query @react-native-community/netinfo
```

```tsx
// app/_layout.tsx (Expo Router) or App.tsx
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)));
AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 2 } } });
// <QueryClientProvider client={queryClient}>…</QueryClientProvider>
```

```tsx
// src/hooks/nodepress.ts
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getEntry, listEntries } from '../lib/nodepress';

export const useEntry = <T,>(type: string, slug?: string, locale?: string) =>
  useQuery({ queryKey: ['nodepress', type, slug, locale], queryFn: () => getEntry<T>(type, slug!, locale), enabled: !!slug });

/** Cursor-paged list for FlatList infinite scroll. */
export const useEntryList = <T,>(type: string, limit = 20) =>
  useInfiniteQuery({
    queryKey: ['nodepress', type, 'list', limit],
    queryFn: ({ pageParam }) => listEntries<T>(type, { limit, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
```

## M4. Screens

```tsx
// app/blog/index.tsx
import { FlatList, Pressable, Text, ActivityIndicator, RefreshControl } from 'react-native';
import { Link } from 'expo-router';
import { useEntryList } from '../../src/hooks/nodepress';
import type { BlogPostData } from '../../src/types/nodepress';

export default function BlogList() {
  const q = useEntryList<BlogPostData>('blog_post');
  const posts = q.data?.pages.flatMap((p) => p.data) ?? [];
  if (q.isLoading) return <ActivityIndicator />;
  if (q.isError) return <Text>Couldn't load posts. Pull to retry.</Text>;
  return (
    <FlatList
      data={posts}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <Link href={`/blog/${item.slug}`} asChild>
          <Pressable><Text>{item.data.title}</Text></Pressable>
        </Link>
      )}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}
    />
  );
}
```

```tsx
// app/blog/[slug].tsx
import { ScrollView, Text, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import RenderHtml from 'react-native-render-html';
import { useEntry } from '../../src/hooks/nodepress';
import type { BlogPostData } from '../../src/types/nodepress';

export default function BlogPost() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { width } = useWindowDimensions();
  const { data: post, isLoading } = useEntry<BlogPostData>('blog_post', slug);
  if (isLoading) return null;
  if (!post) return <Text>Not found</Text>;
  return (
    <ScrollView>
      <Stack.Screen options={{ title: post.data.title }} />
      {post.data.cover?.url && (
        <Image source={{ uri: post.data.cover.url }} style={{ width, height: width * 0.56 }} contentFit="cover" accessibilityLabel={post.data.cover.alt ?? ''} />
      )}
      <Text accessibilityRole="header">{post.data.title}</Text>
      <RenderHtml contentWidth={width} source={{ html: post.data.body ?? '' }} />
    </ScrollView>
  );
}
```

- Use `entry.id` (the publicId) as the list key.
- Rich text is HTML: render it with `react-native-render-html` (or a `WebView`), never by stripping tags with a regex. `react-native-render-html` doesn't run scripts, so no extra sanitizing step is needed there; with a `WebView`, sanitize first and disable JavaScript (`javaScriptEnabled={false}`).
- Links inside rich text: handle `renderersProps={{ a: { onPress: (_, href) => Linking.openURL(href) } }}` and route internal links to screens.

## M5. Images

- `Image` needs an explicit size (or `aspectRatio`). Image fields don't store dimensions; use a fixed aspect ratio per layout.
- `expo-image` caches on disk; for bare RN use `react-native-fast-image` or the built-in `Image`.
- For CMS-stored images, request a size that matches the screen: `cms.imageUrl(image, { w: Math.round(width * PixelRatio.get()), format: 'webp' })`. Other hosts (R2, S3, ImageKit) are returned unchanged.
- Pass `alt` as `accessibilityLabel`.

## M6. Forms

```tsx
import { useState } from 'react';
import { TextInput, Button, Text } from 'react-native';
import { cms, NodePressError } from '../lib/nodepress';

export function ContactForm() {
  const [values, setValues] = useState({ full_name: '', email: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  async function submit() {
    setErrors({});
    try {
      await cms.submitForm('contact-us', values); // no _honey needed: bots don't fill native forms
      setSent(true);
    } catch (err) {
      const list = err instanceof NodePressError ? ((err.body as any)?.errors ?? []) : [];
      setErrors(Object.fromEntries(list.map((x: { path: string; message: string }) => [x.path, x.message])));
    }
  }

  if (sent) return <Text>Thanks! We'll be in touch.</Text>;
  return (
    <>
      <TextInput value={values.full_name} onChangeText={(v) => setValues({ ...values, full_name: v })} placeholder="Name" />
      {errors.full_name && <Text>{errors.full_name}</Text>}
      <TextInput value={values.email} onChangeText={(v) => setValues({ ...values, email: v })} keyboardType="email-address" autoCapitalize="none" placeholder="Email" />
      <TextInput value={values.message} onChangeText={(v) => setValues({ ...values, message: v })} multiline placeholder="Message" />
      <Button title="Send" onPress={submit} />
    </>
  );
}
```

File fields (e.g. a CV from `expo-document-picker`):

```ts
const body = new FormData();
body.append('data', JSON.stringify({ full_name, email }));
body.append('resume', { uri: file.uri, name: file.name, type: file.mimeType ?? 'application/pdf' } as any);
await fetch(`${process.env.EXPO_PUBLIC_NODEPRESS_URL}/api/submit/career-application`, { method: 'POST', body });
```

Captcha widgets are web-only; if a form has captcha enabled, ask the user to turn it off for that form or to create a separate app form without it (the app's own rate limit still applies: 20 submissions per minute per IP).

## M7. Content updates and offline

- Content is fetched at runtime, so CMS edits show up on the next fetch: on app focus, pull-to-refresh, or after `staleTime`. No app release is needed for content changes.
- For offline reading, persist the query cache: `@tanstack/query-async-storage-persister` with `@react-native-async-storage/async-storage`.
- Don't connect the app to the CMS's real-time (Socket.io) gateway: it requires an API key, and a key inside an app is public. Refetching on focus and pull-to-refresh is enough for content. If the user needs push-style updates, that belongs in their own backend (a NodePress webhook → their server → a push notification).

## M8. Deep links to CMS content

Use the entry's slug in the route (`app/blog/[slug].tsx`) so web URLs map to screens. With Expo Router and universal links / app links set up, `https://www.example.com/blog/<slug>` opens the same screen.

## M9. Step-by-step checklist (do these in order)

1. Ask for the CMS URL; run the discovery commands (section 4) and note content types, field keys and media hosts.
2. `npx expo install @nodepress-cms/client @tanstack/react-query @react-native-community/netinfo expo-image react-native-render-html` (bare RN: `npm install` the same, `react-native-fast-image` instead of `expo-image`).
3. Add `EXPO_PUBLIC_NODEPRESS_URL` to `.env` and `.env.example`; note the emulator/device URLs (M1).
4. Create `src/lib/nodepress.ts` (M2), the query client and hooks (M3).
5. Write `src/types/nodepress.ts` with an interface per content type used (section 11).
6. Build screens with loading/error/not-found states, pull-to-refresh and cursor paging (M4); flexible fields through a section registry (section 7) with native components.
7. Images with fixed aspect ratios and `accessibilityLabel` (M5).
8. Forms with per-field errors (M6).
9. Run `npx tsc --noEmit`; start the app on iOS and Android against the CMS.
10. Give the user the release list:
    - Production builds (EAS: `eas.json` env or EAS environment variables) use the `https://` CMS URL.
    - Test on a real device on mobile data: lists load, images show, a form submission appears under Forms → Submissions.
