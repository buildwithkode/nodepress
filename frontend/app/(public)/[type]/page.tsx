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
    return <span style={{ color: '#999', fontSize: 13 }}>No preview available</span>;
  }

  const preview = entries.slice(0, 2);

  return (
    <div>
      {preview.map(([key, val]) => (
        <div key={key} style={{ marginBottom: 4 }}>
          <span style={{ color: '#999', fontSize: 12, textTransform: 'capitalize' }}>
            {key.replace(/_/g, ' ')}:{' '}
          </span>
          <span style={{ fontSize: 14, color: '#333' }}>
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
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: '#111' }}>
          {title}
        </h1>
        <p style={{ color: '#888', marginTop: 8 }}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </p>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 64,
            color: '#bbb',
            border: '2px dashed #f0f0f0',
            borderRadius: 8,
          }}
        >
          No entries published yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {entries.map((entry: any) => (
            <Link
              key={entry.id}
              href={`/${params.type}/${entry.slug}`}
              style={{ textDecoration: 'none' }}
            >
              <div
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: '20px 24px',
                  transition: 'all 0.15s',
                  cursor: 'pointer',
                  background: '#fff',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#1677ff';
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    '0 2px 12px rgba(22,119,255,0.08)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#f0f0f0';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 16,
                      color: '#1677ff',
                    }}
                  >
                    {entry.slug}
                  </span>
                  <span style={{ fontSize: 12, color: '#bbb' }}>
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
      <div
        style={{
          marginTop: 48,
          background: '#f6f8ff',
          border: '1px solid #d6e4ff',
          borderRadius: 8,
          padding: '16px 20px',
        }}
      >
        <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
          <strong>API endpoint:</strong>{' '}
          <code style={{ background: '#e8f0fe', padding: '2px 6px', borderRadius: 3 }}>
            GET {BACKEND}/api/{params.type}
          </code>
          {' · '}
          <Link href={`/api/${params.type}`} style={{ color: '#1677ff', fontSize: 12 }}>
            View JSON ↗
          </Link>
        </p>
      </div>
    </div>
  );
}
