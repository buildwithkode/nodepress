import { createClient, type Entry } from '@nodepress-cms/client';

// .env values (via Vite) or real environment variables.
const env = (name: string): string | undefined => import.meta.env[name] ?? process.env[name];

export const config = {
  url: env('NODEPRESS_URL') || 'http://localhost:3000',
  type: env('NODEPRESS_TYPE') || 'blog',
  populate: (env('NODEPRESS_POPULATE') ?? 'author').split(',').map((s) => s.trim()).filter(Boolean),
  apiKey: env('NODEPRESS_API_KEY') || undefined,
};

export const cms = createClient({ url: config.url, apiKey: config.apiKey });

export const PAGE_SIZE = 10;

export interface PostPage {
  /** 1-based page number. */
  number: number;
  entries: Entry[];
  hasNext: boolean;
}

let cached: Promise<{ pages: PostPage[]; error: string | null }> | undefined;

/**
 * Every page of posts, fetched once per build by following meta.nextCursor.
 * If NodePress can't be reached the build still succeeds, with an empty blog
 * and the error shown on the home page.
 */
export function loadPages() {
  cached ??= (async () => {
    const pages: PostPage[] = [];
    try {
      let cursor: string | undefined;
      do {
        const res = await cms.collection(config.type).list({ limit: PAGE_SIZE, cursor, populate: config.populate, sort: 'createdAt:desc' });
        cursor = res.meta.nextCursor ?? undefined;
        pages.push({ number: pages.length + 1, entries: res.data, hasNext: !!cursor });
      } while (cursor);
      return { pages, error: null };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn(`[nodepress] Couldn't load "${config.type}" from ${config.url}: ${error}`);
      return { pages: [{ number: 1, entries: [], hasNext: false }], error };
    }
  })();
  return cached;
}
