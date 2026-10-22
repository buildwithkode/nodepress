'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@nodepress/client';
import { onPreviewUpdate, enableClickToEdit } from '@nodepress/client/preview';
import { readPost } from '@/lib/post';
import { sanitizeInBrowser } from '@/lib/sanitize-dom';
import { PostArticle } from './PostArticle';

interface Props {
  slug: string;
  createdAt?: string;
  /** The draft as the server loaded it, with HTML sanitized on the server. */
  initialData: Record<string, any>;
  initialBodyHtml: string;
  /** NODEPRESS_URL — only used to build image URLs. */
  cmsUrl: string;
  /** NODEPRESS_ADMIN_URL — messages from other origins are ignored. */
  adminOrigin: string;
}

/** Draft mode view: re-renders as the editor sends unsaved changes. */
export function LivePost({ slug, createdAt, initialData, initialBodyHtml, cmsUrl, adminOrigin }: Props) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const images = useMemo(() => createClient({ url: cmsUrl }), [cmsUrl]);

  useEffect(() => {
    const stopUpdates = onPreviewUpdate((update) => setData(update.data), { adminOrigin });
    const stopClicks = enableClickToEdit({ adminOrigin });
    return () => {
      stopUpdates();
      stopClicks();
    };
  }, [adminOrigin]);

  const live = data ?? initialData;
  const post = readPost(slug, live, createdAt);
  // Relations arrive as ids from the editor; keep the author the server resolved.
  if (!post.author && data) post.author = readPost(slug, initialData).author;
  const bodyHtml = data ? sanitizeInBrowser(post.body) : initialBodyHtml;
  const coverUrl = post.cover ? images.imageUrl(post.cover, { w: 1200, format: 'auto' }) : undefined;

  return <PostArticle post={post} bodyHtml={bodyHtml} coverUrl={coverUrl} />;
}
