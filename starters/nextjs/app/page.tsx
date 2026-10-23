import Link from 'next/link';
import type { Entry, ListResult } from '@nodepress-cms/client';
import { cms, config, posts } from '@/lib/cms';
import { formatDate, readPost } from '@/lib/post';

const PAGE_SIZE = 10;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { cursor } = await searchParams;
  let result: ListResult<Entry> | null = null;
  let error: string | null = null;
  try {
    // Cursor paging: each page links to the next with meta.nextCursor.
    result = await posts().list({ limit: PAGE_SIZE, cursor, populate: config.populate, sort: 'createdAt:desc' });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (error) {
    return (
      <div className="notice">
        <h1>Couldn&apos;t load posts</h1>
        <p>
          Is NodePress running at <code>{config.url}</code> with a content type <code>{config.type}</code>?
        </p>
        <p className="muted">{error}</p>
      </div>
    );
  }

  const entries = result?.data ?? [];
  const next = result?.meta.nextCursor;
  return (
    <>
      <h1>Latest posts</h1>
      {entries.length === 0 && <p className="muted">No published posts yet.</p>}
      <ul className="post-list">
        {entries.map((entry) => {
          const post = readPost(entry.slug, entry.data, entry.createdAt);
          return (
            <li key={entry.id}>
              <Link href={`/posts/${entry.slug}`} className="card">
                {post.cover && (
                  <img src={cms.imageUrl(post.cover, { w: 640, h: 360, fit: 'cover', format: 'auto' })} alt="" loading="lazy" />
                )}
                <div>
                  <h2>{post.title}</h2>
                  <p className="meta">
                    {[post.author, formatDate(post.date)].filter(Boolean).join(' · ')}
                  </p>
                  {post.excerpt && <p>{post.excerpt}</p>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <nav className="pager">
        {cursor && <Link href="/">← Newest</Link>}
        {next && <Link href={`/?cursor=${encodeURIComponent(next)}`}>Older posts →</Link>}
      </nav>
    </>
  );
}
