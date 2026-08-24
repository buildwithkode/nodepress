/**
 * NodePress Frontend SDK for Next.js App Router & React applications.
 * Provides clean helpers for fetching entries, handling draft mode, and querying dynamic APIs.
 */

export interface FetchEntryOptions {
  type: string;
  slug: string;
  draft?: boolean;
  token?: string;
  locale?: string;
  populate?: string[];
  fields?: string[];
  backendUrl?: string;
  next?: NextFetchRequestConfig;
  cache?: RequestCache;
}

export interface FetchEntriesOptions {
  type: string;
  page?: number;
  limit?: number;
  sort?: string;
  where?: Record<string, any>;
  filter?: Record<string, string>;
  search?: string;
  locale?: string;
  populate?: string[];
  fields?: string[];
  backendUrl?: string;
  next?: NextFetchRequestConfig;
  cache?: RequestCache;
}

function getBackendUrl(customUrl?: string): string {
  return (
    customUrl ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

/**
 * Fetch a single entry by content type and slug.
 * Supports draft preview mode when draft=true and token is provided.
 */
export async function fetchEntry<T = any>(options: FetchEntryOptions): Promise<T | null> {
  const {
    type,
    slug,
    draft = false,
    token,
    locale = 'en',
    populate,
    fields,
    backendUrl,
    next,
    cache,
  } = options;

  const base = getBackendUrl(backendUrl);
  const cleanType = type.trim().toLowerCase().replace(/[\s-]+/g, '_');

  const params = new URLSearchParams();
  if (locale) params.set('locale', locale);
  if (populate?.length) params.set('populate', populate.join(','));
  if (fields?.length) params.set('fields', fields.join(','));

  let url: string;
  if (draft && token) {
    params.set('token', token);
    url = `${base}/api/${cleanType}/${encodeURIComponent(slug)}/preview?${params.toString()}`;
  } else {
    url = `${base}/api/${cleanType}/${encodeURIComponent(slug)}?${params.toString()}`;
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      // Never cache draft mode requests; use provided cache or revalidate for production
      cache: draft ? 'no-store' : cache,
      next: draft ? { revalidate: 0 } : next,
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`NodePress API error (${res.status}): ${errBody}`);
    }

    const json = await res.json();
    return json.data || json;
  } catch (error) {
    if (draft) {
      console.warn(`[NodePress] Failed to fetch draft for ${type}/${slug}:`, error);
    }
    return null;
  }
}

/**
 * Fetch a paginated list of entries for a content type with advanced filtering and population.
 */
export async function fetchEntries<T = any>(options: FetchEntriesOptions): Promise<{
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}> {
  const {
    type,
    page = 1,
    limit = 20,
    sort,
    where,
    filter,
    search,
    locale,
    populate,
    fields,
    backendUrl,
    next,
    cache,
  } = options;

  const base = getBackendUrl(backendUrl);
  const cleanType = type.trim().toLowerCase().replace(/[\s-]+/g, '_');

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (sort) params.set('sort', sort);
  if (search) params.set('search', search);
  if (locale) params.set('locale', locale);
  if (populate?.length) params.set('populate', populate.join(','));
  if (fields?.length) params.set('fields', fields.join(','));

  // Encode where parameter if present
  if (where && typeof where === 'object') {
    for (const [key, value] of Object.entries(where)) {
      if (typeof value === 'object' && value !== null) {
        for (const [op, val] of Object.entries(value)) {
          params.set(`where[${key}][${op}]`, String(val));
        }
      } else if (value !== undefined) {
        params.set(`where[${key}]`, String(value));
      }
    }
  }

  // Encode legacy filter if present
  if (filter && typeof filter === 'object') {
    for (const [key, val] of Object.entries(filter)) {
      if (val !== undefined) params.set(`filter[${key}]`, String(val));
    }
  }

  const url = `${base}/api/${cleanType}?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache,
    next,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`NodePress API list error (${res.status}): ${errBody}`);
  }

  return res.json();
}
