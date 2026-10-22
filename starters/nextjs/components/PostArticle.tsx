import { formatDate, type PostFields } from '@/lib/post';

/**
 * One post. Rendered on the server for visitors and in the browser for live
 * preview, so it takes HTML that is already sanitized. `data-np-field` marks
 * which entry field an element shows — click-to-edit in the editor uses it.
 */
export function PostArticle({ post, bodyHtml, coverUrl }: { post: PostFields; bodyHtml: string; coverUrl?: string }) {
  const date = formatDate(post.date);
  return (
    <article className="post">
      <h1 data-np-field="title">{post.title}</h1>
      {(post.author || date) && (
        <p className="meta">
          {post.author && <span data-np-field="author">{post.author}</span>}
          {post.author && date && ' · '}
          {date && <time dateTime={post.date}>{date}</time>}
        </p>
      )}
      {coverUrl && (
        // Plain <img>: the CMS serves resized WebP/AVIF itself (cms.imageUrl).
        <img className="cover" src={coverUrl} alt="" data-np-field="cover" />
      )}
      {post.excerpt && <p className="excerpt" data-np-field="excerpt">{post.excerpt}</p>}
      <div className="body" data-np-field="body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </article>
  );
}
