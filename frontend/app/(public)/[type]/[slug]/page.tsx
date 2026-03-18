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
  const title =
    entry?.data?.title || entry?.data?.name || params.slug;
  return {
    title: `${title} | NodePress`,
  };
}

// Smart field value renderer
function FieldValue({ name, value }: { name: string; value: any }) {
  const label = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const renderValue = () => {
    if (value === null || value === undefined) {
      return <span className="text-gray-200">—</span>;
    }

    // Image field
    if (
      typeof value === 'string' &&
      (value.startsWith('http') || value.startsWith('/uploads')) &&
      /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(value)
    ) {
      return (
        <img
          src={value}
          alt={name}
          className="max-w-full max-h-96 rounded-md border border-gray-100 block"
        />
      );
    }

    // Boolean
    if (typeof value === 'boolean') {
      return (
        <span
          className={
            value
              ? 'inline-block bg-green-50 text-green-600 border border-green-200 rounded px-2.5 py-0.5 text-sm'
              : 'inline-block bg-red-50 text-red-500 border border-red-200 rounded px-2.5 py-0.5 text-sm'
          }
        >
          {value ? 'Yes' : 'No'}
        </span>
      );
    }

    // Number
    if (typeof value === 'number') {
      return <span className="font-medium text-gray-800">{value.toLocaleString()}</span>;
    }

    // Repeater — array of objects
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-gray-300">Empty</span>;
      }
      return (
        <div className="flex flex-col gap-3">
          {value.map((item: any, i: number) => (
            <div
              key={i}
              className="border border-gray-100 rounded-md px-4 py-3 bg-gray-50"
            >
              {typeof item === 'object' && !Array.isArray(item)
                ? Object.entries(item)
                    .filter(([k]) => k !== '_layout')
                    .map(([k, v]) => (
                      <div key={k} className="mb-1">
                        <span className="text-gray-400 text-xs">
                          {k.replace(/_/g, ' ')}:{' '}
                        </span>
                        <span className="text-sm text-gray-700">{String(v)}</span>
                      </div>
                    ))
                : String(item)}
            </div>
          ))}
        </div>
      );
    }

    // Rich text / HTML string (contains HTML tags)
    if (typeof value === 'string' && /<[a-z][\s\S]*>/i.test(value)) {
      return (
        <div
          className="leading-relaxed text-gray-700 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: value }}
        />
      );
    }

    // Long text
    if (typeof value === 'string' && value.length > 100) {
      return (
        <p className="leading-relaxed text-gray-700 whitespace-pre-wrap m-0">{value}</p>
      );
    }

    // Default — short string
    return <span className="text-gray-700">{String(value)}</span>;
  };

  return (
    <div className="grid gap-x-6 gap-y-3 pb-5 mb-5 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0"
      style={{ gridTemplateColumns: '160px 1fr' }}
    >
      <div className="text-gray-400 text-sm pt-0.5 font-medium">{label}</div>
      <div>{renderValue()}</div>
    </div>
  );
}

export default async function EntryDetailPage({
  params,
}: {
  params: { type: string; slug: string };
}) {
  const entry = await getEntry(params.type, params.slug);

  if (!entry) notFound();

  const title =
    entry.data?.title || entry.data?.name || entry.slug;

  const typeLabel = params.type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-gray-400">
        <Link href={`/${params.type}`} className="text-blue-500 hover:underline no-underline">
          {typeLabel}
        </Link>
        {' / '}
        <span className="text-gray-500">{entry.slug}</span>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>

      {/* Meta */}
      <div className="flex flex-wrap gap-4 mb-10 text-xs text-gray-400">
        <span>Published {new Date(entry.createdAt).toLocaleDateString()}</span>
        {entry.updatedAt !== entry.createdAt && (
          <span>Updated {new Date(entry.updatedAt).toLocaleDateString()}</span>
        )}
        <span className="bg-blue-50 text-blue-500 px-2 py-0.5 rounded">
          {params.type}
        </span>
      </div>

      {/* Fields */}
      <div>
        {Object.entries(entry.data).map(([key, value]) => (
          <FieldValue key={key} name={key} value={value} />
        ))}
      </div>

      {/* API info */}
      <div className="mt-12 bg-blue-50 border border-blue-100 rounded-lg px-5 py-4">
        <p className="text-xs text-gray-500 m-0">
          <strong>API endpoint:</strong>{' '}
          <code className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs">
            GET {BACKEND}/api/{params.type}/{params.slug}
          </code>
          {' · '}
          <Link
            href={`/api/${params.type}/${params.slug}`}
            className="text-blue-500 text-xs hover:underline"
          >
            View JSON ↗
          </Link>
        </p>
      </div>
    </div>
  );
}
