import { createClient, type Entry } from '@nodepress/client';

export const config = {
  url: process.env.NODEPRESS_URL || 'http://localhost:3000',
  type: process.env.NODEPRESS_TYPE || 'blog',
  populate: (process.env.NODEPRESS_POPULATE ?? 'author').split(',').map((s) => s.trim()).filter(Boolean),
  apiKey: process.env.NODEPRESS_API_KEY || undefined,
  adminUrl: process.env.NODEPRESS_ADMIN_URL || 'http://localhost:5173',
};

/** Published content, cached for a minute (Next.js fetch cache). */
export const cms = createClient({
  url: config.url,
  apiKey: config.apiKey,
  fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 60 } }),
});

/** Drafts are never cached. */
const uncached = createClient({
  url: config.url,
  apiKey: config.apiKey,
  fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
});

export const posts = () => cms.collection(config.type);

/** GET /api/{type}/{slug}/preview?token= — a draft, with a token from the editor. */
export function getPreview(slug: string, token: string, locale?: string): Promise<Entry & { status?: string }> {
  const qs = new URLSearchParams({ token, ...(locale ? { locale } : {}) });
  return uncached.request('GET', `/${encodeURIComponent(config.type)}/${encodeURIComponent(slug)}/preview?${qs}`);
}

/** The cookies /api/draft sets next to Next.js' own draft mode cookie. */
export const PREVIEW_TOKEN_COOKIE = 'nodepress_preview_token';
export const PREVIEW_LOCALE_COOKIE = 'nodepress_preview_locale';
