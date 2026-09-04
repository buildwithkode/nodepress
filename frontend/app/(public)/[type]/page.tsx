import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000';

async function getEntries(type: string) {
  try {
    const res = await fetch(`${BACKEND}/api/${type}`, {
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
  params: { type: string };
}): Promise<Metadata> {
  const title = params.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: `${title} | NodePress CMS`,
    description: `Explore all published ${title.toLowerCase()} on NodePress.`,
  };
}

export default async function EntryListPage({
  params,
}: {
  params: { type: string };
}) {
  const raw = await getEntries(params.type);

  if (raw === null) notFound();

  const entries = Array.isArray(raw) ? raw : (raw?.data && Array.isArray(raw.data) ? raw.data : []);
  const title = params.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="border-b border-gray-100 pb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold mb-3">
          <span>●</span> Public Archive
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">{title}</h1>
        <p className="text-gray-500 mt-2 text-base">
          {entries.length} {entries.length === 1 ? 'published article' : 'published articles'}
        </p>
      </div>

      {/* Entry list / Grid */}
      {entries.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm">
          No published entries available yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {entries.map((entry: any) => {
            const data = entry.data || {};
            const postTitle = data.title || data.name || entry.slug;
            const excerpt = data.excerpt || data.description || '';
            const featuredImage = data.featured_image || data.image || entry.seo?.image;
            const category = data.category || params.type;
            const author = data.author || 'Editorial Team';
            const readTime = data.read_time || '3 min read';
            const dateStr = new Date(entry.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <Link
                key={entry.id || entry.slug}
                href={`/${params.type}/${entry.slug}`}
                className="group flex flex-col bg-white border border-gray-200/80 rounded-2xl overflow-hidden hover:shadow-xl hover:border-blue-400/60 transition-all duration-300 no-underline"
              >
                {/* Featured Image */}
                {featuredImage && (
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={featuredImage}
                      alt={postTitle}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 left-3 bg-gray-900/80 backdrop-blur-sm text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
                      {category}
                    </div>
                  </div>
                )}

                {/* Card Body */}
                <div className="flex-1 p-6 flex flex-col justify-between">
                  <div>
                    {!featuredImage && (
                      <span className="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-md mb-3">
                        {category}
                      </span>
                    )}
                    <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                      {postTitle}
                    </h2>
                    {excerpt && (
                      <p className="mt-3 text-sm text-gray-600 line-clamp-3 leading-relaxed">
                        {excerpt}
                      </p>
                    )}
                  </div>

                  {/* Author & Meta Footer */}
                  <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                    <span className="font-medium text-gray-700">{author}</span>
                    <div className="flex items-center gap-2">
                      <span>{dateStr}</span>
                      <span>•</span>
                      <span>{readTime}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* API info box */}
      <div className="mt-14 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
          <p className="text-xs text-gray-600 font-mono m-0">
            <strong>API Endpoint:</strong> GET /api/{params.type}
          </p>
        </div>
        <Link
          href={`/api/${params.type}`}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-white px-3 py-1.5 rounded-lg border border-blue-200 shadow-sm transition-all"
        >
          View Raw JSON ↗
        </Link>
      </div>
    </div>
  );
}
