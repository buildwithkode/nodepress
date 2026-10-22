// Field mapping shared by server pages and the live preview (no server-only imports).
// The "Blog" template's `post` type has title, excerpt, body, cover and author;
// common alternatives (content, image, name…) are picked up too. Adjust to your schema.

export interface PostFields {
  title: string;
  excerpt?: string;
  /** Raw richtext HTML — sanitize before rendering. */
  body?: string;
  /** Image URL as stored (an absolute URL to the upload). */
  cover?: string;
  author?: string;
  date?: string;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
const imageUrl = (v: any) => str(v) ?? str(v?.url);

export function readPost(slug: string, data: Record<string, any> = {}, createdAt?: string): PostFields {
  // A populated relation is an entry ({ slug, data }); unpopulated it's just an id.
  const a = data.author;
  const author = a && typeof a === 'object' ? str(a.data?.name) ?? str(a.data?.title) ?? str(a.name) ?? str(a.slug) : undefined;
  return {
    title: str(data.title) ?? str(data.name) ?? str(data.heading) ?? slug,
    excerpt: str(data.excerpt) ?? str(data.summary) ?? str(data.description),
    body: str(data.body) ?? str(data.content),
    cover: imageUrl(data.cover) ?? imageUrl(data.image) ?? imageUrl(data.featured_image) ?? imageUrl(data.thumbnail),
    author,
    date: str(data.published_on) ?? str(data.date) ?? createdAt,
  };
}

export function formatDate(value?: string) {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
}
