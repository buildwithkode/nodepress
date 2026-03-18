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
  return {
    title: `${params.type.replace(/_/g, ' ')} | NodePress`,
  };
}

// Render a preview of entry data (first 2 non-empty text fields)
function EntryPreview({ data }: { data: Record<string, any> }) {
  const entries = Object.entries(data).filter(
    ([, v]) =>
      v !== null &&
      v !== undefined &&
      typeof v !== 'object' &&
      typeof v !== 'boolean',
  );

  if (entries.length === 0) {
    return <span className="text-gray-400 text-xs">No preview available</span>;
  }

  const preview = entries.slice(0, 2);

  return (
    <div className="space-y-1">
      {preview.map(([key, val]) => (
        <div key={key}>
          <span className="text-gray-400 text-xs capitalize">
            {key.replace(/_/g, ' ')}:{' '}
          </span>
          <span className="text-sm text-gray-600">
            {String(val).length > 120 ? String(val).slice(0, 120) + '…' : String(val)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function EntryListPage({
  params,
}: {
  params: { type: string };
}) {
  const entries = await getEntries(params.type);

  if (entries === null) notFound();

  const title = params.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        <p className="text-gray-400 mt-2 text-sm">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </p>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-lg text-gray-300 text-sm">
          No entries published yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {entries.map((entry: any) => (
            <Link
              key={entry.id}
              href={`/${params.type}/${entry.slug}`}
              className="block no-underline group"
            >
              <div className="bg-white border border-gray-200 rounded-lg px-6 py-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-base text-blue-600 group-hover:text-blue-700">
                    {entry.slug}
                  </span>
                  <span className="text-xs text-gray-300 shrink-0 ml-4">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <EntryPreview data={entry.data} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* API info box */}
      <div className="mt-12 bg-blue-50 border border-blue-100 rounded-lg px-5 py-4">
        <p className="text-xs text-gray-500 m-0">
          <strong>API endpoint:</strong>{' '}
          <code className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs">
            GET {BACKEND}/api/{params.type}
          </code>
          {' · '}
          <Link href={`/api/${params.type}`} className="text-blue-500 text-xs hover:underline">
            View JSON ↗
          </Link>
        </p>
      </div>
    </div>
  );
}
