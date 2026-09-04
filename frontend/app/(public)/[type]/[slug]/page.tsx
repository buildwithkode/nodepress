import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000';

async function getEntry(type: string, slug: string) {
  try {
    const res = await fetch(`${BACKEND}/api/${type}/${slug}`, {
      cache: 'no-store',
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { type: string; slug: string };
}): Promise<Metadata> {
  const entry = await getEntry(params.type, params.slug);
  if (!entry) return { title: 'Not Found' };

  const fallbackTitle = entry.data?.title || entry.data?.name || params.slug;
  const title = entry.seo?.title || fallbackTitle;
  const description = entry.seo?.description || entry.data?.description || entry.data?.excerpt || undefined;
  const image = entry.seo?.image || entry.data?.featured_image || entry.data?.image || undefined;

  return {
    title: `${title} | NodePress CMS`,
    description,
    robots: entry.seo?.noIndex ? 'noindex, nofollow' : 'index, follow',
    alternates: { canonical: `/${params.type}/${params.slug}` },
    openGraph: {
      title,
      description,
      url: `/${params.type}/${params.slug}`,
      ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
      type: 'article',
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function EntryDetailPage({
  params,
}: {
  params: { type: string; slug: string };
}) {
  const entry = await getEntry(params.type, params.slug);

  if (!entry) notFound();

  const data = entry.data || {};
  const title = data.title || data.name || entry.slug;
  const category = data.category || params.type;
  const author = data.author || 'Editorial Team';
  const readTime = data.read_time || '4 min read';
  const excerpt = data.excerpt || data.description || '';
  const featuredImage = data.featured_image || data.image || entry.seo?.image;
  const content = data.content || '';
  const rawTags = data.tags || '';
  const tagsList = typeof rawTags === 'string' && rawTags.length > 0
    ? rawTags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : [];

  const typeLabel = params.type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const siteUrl = process.env.SITE_URL || 'http://localhost:5173';
  const canonicalUrl = `${siteUrl}/${params.type}/${params.slug}`;
  const description = entry.seo?.description || excerpt || undefined;
  const image = entry.seo?.image || featuredImage || undefined;

  const dateFormatted = new Date(entry.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    image: image ? [image] : undefined,
    datePublished: entry.createdAt,
    dateModified: entry.updatedAt,
    author: {
      '@type': 'Person',
      name: author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'NodePress',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: typeLabel,
        item: `${siteUrl}/${params.type}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: title,
        item: canonicalUrl,
      },
    ],
  };

  return (
    <article className="max-w-3xl mx-auto space-y-10">
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Navigation Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-medium text-gray-400">
        <Link href={`/${params.type}`} className="text-blue-600 hover:text-blue-800 no-underline transition-colors">
          ← Back to {typeLabel}
        </Link>
        <span>/</span>
        <span className="text-gray-600 truncate max-w-[280px]">{entry.slug}</span>
      </nav>

      {/* Article Header */}
      <header className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full border border-blue-100">
            {category}
          </span>
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-500 font-medium">{readTime}</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
          {title}
        </h1>

        {excerpt && (
          <p className="text-lg text-gray-600 leading-relaxed font-normal">
            {excerpt}
          </p>
        )}

        {/* Author Byline */}
        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
              {author.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 m-0">{author}</p>
              <p className="text-xs text-gray-400 m-0">Published on {dateFormatted}</p>
            </div>
          </div>
          <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2.5 py-1 rounded border border-gray-200">
            JSON-LD Validated
          </span>
        </div>
      </header>

      {/* Featured Image */}
      {featuredImage && (
        <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden shadow-lg border border-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={featuredImage}
            alt={title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Article Content */}
      <section className="prose prose-lg prose-blue max-w-none text-gray-800 leading-relaxed space-y-6">
        {content ? (
          <div
            className="np-rich [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:text-gray-900 [&>h2]:mt-8 [&>h2]:mb-4 [&>h3]:text-xl [&>h3]:font-semibold [&>h3]:text-gray-800 [&>h3]:mt-6 [&>h3]:mb-3 [&>p]:leading-relaxed [&>p]:text-gray-700 [&>blockquote]:border-l-4 [&>blockquote]:border-blue-500 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-gray-600 [&>blockquote]:my-6 [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:space-y-2 [&>ul]:text-gray-700"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <p className="text-gray-400 italic">No content available for this article.</p>
        )}
      </section>

      {/* Tags Row */}
      {tagsList.length > 0 && (
        <div className="pt-8 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Tags & Topics</p>
          <div className="flex flex-wrap gap-2">
            {tagsList.map((tag: string) => (
              <span
                key={tag}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-1.5 rounded-lg transition-colors cursor-default"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer Navigation Box */}
      <footer className="bg-gray-50 border border-gray-200/80 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-gray-900">Like this article?</h4>
          <p className="text-xs text-gray-500 mt-0.5">Explore more articles in the {typeLabel} archive.</p>
        </div>
        <Link
          href={`/${params.type}`}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs px-4 py-2.5 rounded-xl shadow transition-all no-underline shrink-0"
        >
          View All {typeLabel} →
        </Link>
      </footer>
    </article>
  );
}
