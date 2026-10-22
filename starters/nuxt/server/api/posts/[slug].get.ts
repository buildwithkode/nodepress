import { NodePressError } from '@nodepress/client';
import { readPost } from '#shared/post';

/** GET /api/posts/:slug — one post with its richtext sanitized on the server. */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? '';
  let entry;
  try {
    entry = await cms.collection(cmsConfig.type).get(slug, { populate: cmsConfig.populate });
  } catch (err) {
    const status = err instanceof NodePressError ? err.status : 502;
    throw createError({ statusCode: status >= 400 ? status : 502, statusMessage: 'Could not load the post' });
  }
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'Post not found' });

  const post = readPost(entry.slug, entry.data, entry.createdAt);
  return {
    slug: entry.slug,
    title: post.title,
    excerpt: post.excerpt,
    author: post.author,
    date: post.date,
    seo: entry.seo ?? null,
    bodyHtml: sanitizeRichText(post.body),
    coverUrl: post.cover ? cms.imageUrl(post.cover, { w: 1200, format: 'auto' }) : undefined,
  };
});
