/**
 * @nodepress/client — a small typed client for the NodePress public API.
 *
 *   import { createClient } from '@nodepress/client';
 *   import type { NodePressContentTypes } from './types/nodepress'; // npx nodepress generate:types
 *
 *   const cms = createClient<NodePressContentTypes>({ url: 'https://cms.example.com' });
 *   const { data } = await cms.collection('blog_post').list({ where: { featured: { eq: true } }, limit: 10 });
 *
 * Works in Node 18+, browsers, Deno, Bun and edge runtimes (it only needs fetch).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SEO {
  title?: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
  noIndex?: boolean;
}

/** A published entry as the REST API returns it. `id` is the entry's publicId. */
export interface Entry<TData = Record<string, any>> {
  id: string;
  slug: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
  seo?: SEO | null;
  data: TData;
}

export interface ListMeta {
  /** Omitted in cursor mode. */
  total?: number;
  page?: number;
  limit: number;
  totalPages?: number;
  /** Pass as `cursor` to get the next page; null on the last page. */
  nextCursor?: string | null;
  searchMode?: 'fulltext' | 'fallback' | 'meilisearch';
}

export interface ListResult<T> {
  data: T[];
  meta: ListMeta;
}

type Scalar = string | number | boolean | null;

/** Operators of ?where[field][op]=value. */
export interface FieldOperators {
  eq?: Scalar;
  ne?: Scalar;
  gt?: Scalar;
  gte?: Scalar;
  lt?: Scalar;
  lte?: Scalar;
  in?: Scalar[];
  notIn?: Scalar[];
  contains?: string;
  startsWith?: string;
  endsWith?: string;
  null?: boolean;
  notNull?: boolean;
}

/** A value, operators, or — on a relation field — a filter on the related entry's fields. */
export type FieldFilter = Scalar | FieldOperators | { [relatedField: string]: Scalar | FieldOperators };

type BaseKeys = 'id' | 'publicId' | 'slug' | 'locale' | 'createdAt' | 'updatedAt';

export type Where<TData = Record<string, any>> = {
  // `Where[]` is only meant for OR/AND; it's in the value union so untyped
  // (index-signature) data still accepts the combinators.
  [K in keyof TData | BaseKeys]?: FieldFilter | Where<TData>[];
} & {
  OR?: Where<TData>[];
  AND?: Where<TData>[];
};

export type Stage = 'published' | 'staging' | 'draft' | 'all';

export interface ReadOptions {
  /** Language code. Default: the client's `locale`, else the site's default language. */
  locale?: string;
  /** Serve the default language where there's no translation. */
  fallback?: boolean;
  /** Relation fields to inline, dot paths for nested ones: ['author', 'author.company']. */
  populate?: string[];
  /** Only return these data fields. */
  fields?: string[];
  /** Unpublished stages need an API key or token. */
  stage?: Stage;
}

export interface ListQuery<TData = Record<string, any>> extends ReadOptions {
  where?: Where<TData>;
  /** "createdAt:desc" (default), "updatedAt:asc", "slug:asc"… */
  sort?: `${'createdAt' | 'updatedAt' | 'slug'}:${'asc' | 'desc'}`;
  search?: string;
  page?: number;
  /** 1–100, default 20. */
  limit?: number;
  cursor?: string;
}

export interface ImageOptions {
  w?: number;
  h?: number;
  q?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  format?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
}

export interface ClientOptions {
  /** The NodePress backend, e.g. https://cms.example.com (a trailing /api is fine). */
  url: string;
  /** Sent as X-API-Key — needed for writes and unpublished stages. Keep write keys server-side. */
  apiKey?: string;
  /** A JWT access token, sent as a Bearer token. */
  token?: string;
  /** Default language for reads. */
  locale?: string;
  /** Default for `fallback` on reads. */
  fallback?: boolean;
  /** Read the staging environment (X-NodePress-Environment). Needs credentials. */
  environment?: 'staging';
  headers?: Record<string, string>;
  /** Custom fetch (tests, Next.js cache options, proxies). Default: globalThis.fetch. */
  fetch?: typeof fetch;
}

export class NodePressError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'NodePressError';
  }
}

/**
 * Maps content type names to entry types — `NodePressContentTypes` from
 * `generate:types` fits. (Mapped over T so interfaces satisfy it too.)
 */
export type ContentTypeMap<T = any> = { [K in keyof T]: Entry<any> };

// ── Query strings ─────────────────────────────────────────────────────────────

/** Serialize nested objects the way the API parses them: where[a][b]=1, populate=a,b. */
export function toQueryString(params: Record<string, unknown>): string {
  const parts: string[] = [];
  const add = (key: string, value: unknown) => {
    if (value === undefined) return;
    if (value === null) {
      parts.push(`${encodeURIComponent(key)}=null`);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => add(`${key}[${i}]`, v));
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) add(`${key}[${k}]`, v);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  };
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    // Flat lists are comma-separated (populate=a,b); `in` lists too, which the API splits.
    if (Array.isArray(value) && value.every((v) => typeof v !== 'object')) {
      if (value.length) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.join(','))}`);
    } else if (key === 'where' && value && typeof value === 'object') {
      addWhere('where', value as Record<string, unknown>, parts);
    } else {
      add(key, value);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function addWhere(prefix: string, where: Record<string, unknown>, parts: string[]) {
  for (const [k, v] of Object.entries(where)) {
    const key = `${prefix}[${k}]`;
    if (v === undefined) continue;
    if ((k === 'OR' || k === 'AND') && Array.isArray(v)) {
      v.forEach((clause, i) => addWhere(`${key}[${i}]`, clause as Record<string, unknown>, parts));
    } else if (Array.isArray(v)) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v.map(String).join(','))}`);
    } else if (v !== null && typeof v === 'object') {
      addWhere(key, v as Record<string, unknown>, parts);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v === null ? 'null' : String(v))}`);
    }
  }
}

// ── Client ────────────────────────────────────────────────────────────────────

export class Collection<TEntry extends Entry<any>> {
  constructor(
    private readonly client: NodePressClient<any>,
    readonly type: string,
  ) {}

  /** GET /api/{type} */
  list(query: ListQuery<TEntry['data']> = {}): Promise<ListResult<TEntry>> {
    return this.client.request('GET', `/${encodeURIComponent(this.type)}${this.client.readQuery(query)}`);
  }

  /** GET /api/{type}/{slug} — null when there's no such (published) entry. */
  async get(slug: string, options: ReadOptions = {}): Promise<TEntry | null> {
    try {
      return await this.client.request<TEntry>(
        'GET',
        `/${encodeURIComponent(this.type)}/${encodeURIComponent(slug)}${this.client.readQuery(options)}`,
      );
    } catch (err) {
      if (err instanceof NodePressError && err.status === 404) return null;
      throw err;
    }
  }

  /** Every entry that matches, fetched page by page (cursor paging; page paging with `search`). */
  async *all(query: Omit<ListQuery<TEntry['data']>, 'page' | 'cursor'> = {}): AsyncGenerator<TEntry> {
    const limit = query.limit ?? 100;
    if (query.search) {
      for (let page = 1; ; page++) {
        const res = await this.list({ ...query, limit, page });
        yield* res.data;
        if (!res.meta.totalPages || page >= res.meta.totalPages) return;
      }
    }
    let cursor: string | undefined;
    do {
      const res = await this.list({ ...query, limit, cursor });
      yield* res.data;
      cursor = res.meta.nextCursor ?? undefined;
    } while (cursor);
  }

  /** POST /api/{type} — needs a write API key or token. Published unless `status: 'draft'`. */
  create(input: { slug: string; data: TEntry['data']; locale?: string; status?: 'draft' | 'published' }): Promise<any> {
    return this.client.request('POST', `/${encodeURIComponent(this.type)}`, input);
  }

  /** PUT /api/{type}/{slug} — `data` replaces the entry's data. */
  update(slug: string, data: TEntry['data'], options: { locale?: string } = {}): Promise<any> {
    return this.client.request('PUT', `/${encodeURIComponent(this.type)}/${encodeURIComponent(slug)}`, { data, locale: options.locale });
  }

  /** DELETE /api/{type}/{slug} (soft delete). */
  delete(slug: string, options: { locale?: string } = {}): Promise<any> {
    return this.client.request(
      'DELETE',
      `/${encodeURIComponent(this.type)}/${encodeURIComponent(slug)}${toQueryString({ locale: options.locale })}`,
    );
  }
}

export class NodePressClient<TTypes extends ContentTypeMap<TTypes> = Record<string, Entry>> {
  /** The backend origin, without /api. */
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(readonly options: ClientOptions) {
    if (!options?.url) throw new Error('@nodepress/client: `url` is required');
    this.baseUrl = options.url.replace(/\/+$/, '').replace(/\/api$/, '');
    const f = options.fetch ?? (globalThis as any).fetch;
    if (typeof f !== 'function') throw new Error('@nodepress/client: no fetch available — pass `fetch` in the options');
    this.fetchImpl = f.bind(globalThis);
  }

  /** Entries of one content type. */
  collection<K extends keyof TTypes & string>(type: K): Collection<TTypes[K]> {
    return new Collection<TTypes[K]>(this, type);
  }

  /** POST /graphql — throws NodePressError when the response has errors. */
  async graphql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await this.raw('POST', `${this.baseUrl}/graphql`, { query, variables });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body.errors?.length) {
      throw new NodePressError(body.errors?.[0]?.message ?? `GraphQL request failed (${res.status})`, res.status, body);
    }
    return body.data as T;
  }

  /** GET /api/locales — the site's languages. */
  locales(): Promise<{ locales: string[]; defaultLocale: string }> {
    return this.request('GET', '/locales');
  }

  /** POST /api/submit/{slug} — a public form submission. */
  submitForm(slug: string, data: Record<string, unknown>, options: { captchaToken?: string } = {}): Promise<any> {
    return this.request('POST', `/submit/${encodeURIComponent(slug)}`, { data, captchaToken: options.captchaToken });
  }

  /** A resized/re-encoded URL for an uploaded image (GET /api/media/{file}/transform). */
  imageUrl(src: string | { url: string } | null | undefined, options: ImageOptions = {}): string {
    const url = typeof src === 'string' ? src : src?.url ?? '';
    const file = url.split('?')[0].split('/').pop() ?? '';
    if (!file || (!/\/uploads\//.test(url) && !/^[^/]+$/.test(url))) return url; // not a local upload
    return `${this.baseUrl}/api/media/${encodeURIComponent(file)}/transform${toQueryString({ ...options })}`;
  }

  /** @internal */
  readQuery(query: ListQuery<any> | ReadOptions): string {
    return toQueryString({
      ...query,
      locale: query.locale ?? this.options.locale,
      fallback: query.fallback ?? this.options.fallback,
    });
  }

  /** A request to /api{path}. Throws NodePressError for non-2xx responses. */
  async request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.raw(method, `${this.baseUrl}/api${path}`, body);
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // not JSON — keep the text
    }
    if (!res.ok) {
      const msg = Array.isArray(parsed?.message) ? parsed.message.join(', ') : parsed?.message;
      throw new NodePressError(msg || `${method} ${path} failed (${res.status})`, res.status, parsed);
    }
    return parsed as T;
  }

  private raw(method: string, url: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...this.options.headers };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.options.apiKey) headers['X-API-Key'] = this.options.apiKey;
    if (this.options.token) headers.Authorization = `Bearer ${this.options.token}`;
    if (this.options.environment) headers['X-NodePress-Environment'] = this.options.environment;
    return this.fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }
}

export function createClient<TTypes extends ContentTypeMap<TTypes> = Record<string, Entry>>(
  options: ClientOptions,
): NodePressClient<TTypes> {
  return new NodePressClient<TTypes>(options);
}
