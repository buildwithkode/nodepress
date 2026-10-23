import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies, draftMode } from 'next/headers';
import { NodePressError, type Entry } from '@nodepress-cms/client';
import { cms, config, getPreview, posts, PREVIEW_LOCALE_COOKIE, PREVIEW_TOKEN_COOKIE } from '@/lib/cms';
import { readPost } from '@/lib/post';
import { sanitizeRichText } from '@/lib/sanitize';
import { PostArticle } from '@/components/PostArticle';
import { LivePost } from '@/components/LivePost';

type Props = { params: Promise<{ slug: string }> };

/** The published entry, or — in draft mode — the draft the preview token unlocks. */
async function load(slug: string): Promise<{ entry: Entry | null; draft: boolean }> {
  const draft = (await draftMode()).isEnabled;
  if (draft) {
    const jar = await cookies();
    const token = jar.get(PREVIEW_TOKEN_COOKIE)?.value;
    if (token) {
      try {
        return { entry: await getPreview(slug, token, jar.get(PREVIEW_LOCALE_COOKIE)?.value), draft };
      } catch (err) {
        // Expired token or a different entry: fall back to the published version.
        if (!(err instanceof NodePressError)) throw err;
      }
    }
  }
  try {
    return { entry: await posts().get(slug, { populate: config.populate }), draft };
  } catch (err) {
    if (err instanceof NodePressError) return { entry: null, draft };
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { entry } = await load(slug);
  if (!entry) return {};
  const post = readPost(entry.slug, entry.data);
  return { title: entry.seo?.title || post.title, description: entry.seo?.description || post.excerpt };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const { entry, draft } = await load(slug);
  if (!entry) notFound();

  const post = readPost(entry.slug, entry.data, entry.createdAt);
  const bodyHtml = sanitizeRichText(post.body);

  if (draft) {
    return (
      <LivePost
        slug={entry.slug}
        createdAt={entry.createdAt}
        initialData={entry.data}
        initialBodyHtml={bodyHtml}
        cmsUrl={config.url}
        adminOrigin={config.adminUrl}
      />
    );
  }
  const coverUrl = post.cover ? cms.imageUrl(post.cover, { w: 1200, format: 'auto' }) : undefined;
  return <PostArticle post={post} bodyHtml={bodyHtml} coverUrl={coverUrl} />;
}
