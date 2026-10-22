import { readPost, type PostFields } from '#shared/post';

export interface PostSummary extends Omit<PostFields, 'body'> {
  slug: string;
  coverUrl?: string;
}

/** GET /api/posts?cursor= — one page of posts, cursor-paged. */
export default defineEventHandler(async (event) => {
  const { cursor } = getQuery(event);
  try {
    const res = await cms.collection(cmsConfig.type).list({
      limit: 10,
      cursor: typeof cursor === 'string' && cursor ? cursor : undefined,
      populate: cmsConfig.populate,
      sort: 'createdAt:desc',
    });
    const posts: PostSummary[] = res.data.map((entry) => {
      const { body: _body, ...post } = readPost(entry.slug, entry.data, entry.createdAt);
      return {
        ...post,
        slug: entry.slug,
        coverUrl: post.cover ? cms.imageUrl(post.cover, { w: 640, h: 360, fit: 'cover', format: 'auto' }) : undefined,
      };
    });
    return { posts, nextCursor: res.meta.nextCursor ?? null, error: null as string | null };
  } catch (err) {
    // Show the page with the reason instead of a bare 500.
    const error = `Couldn't load "${cmsConfig.type}" from ${cmsConfig.url}: ${err instanceof Error ? err.message : String(err)}`;
    return { posts: [] as PostSummary[], nextCursor: null, error };
  }
});
