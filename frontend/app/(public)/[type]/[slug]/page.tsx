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
      return <span style={{ color: '#ccc' }}>—</span>;
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
          style={{
            maxWidth: '100%',
            maxHeight: 400,
            borderRadius: 6,
            border: '1px solid #f0f0f0',
            display: 'block',
          }}
        />
      );
    }

    // Boolean
    if (typeof value === 'boolean') {
      return (
        <span
          style={{
            background: value ? '#f6ffed' : '#fff1f0',
            color: value ? '#52c41a' : '#ff4d4f',
            border: `1px solid ${value ? '#b7eb8f' : '#ffa39e'}`,
            borderRadius: 4,
            padding: '2px 10px',
            fontSize: 13,
          }}
        >
          {value ? 'Yes' : 'No'}
        </span>
      );
    }

    // Number
    if (typeof value === 'number') {
      return <span style={{ fontWeight: 500 }}>{value.toLocaleString()}</span>;
    }

    // Repeater — array of objects
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span style={{ color: '#ccc' }}>Empty</span>;
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {value.map((item: any, i: number) => (
            <div
              key={i}
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                padding: '12px 16px',
                background: '#fafafa',
              }}
            >
              {typeof item === 'object' && !Array.isArray(item)
                ? Object.entries(item)
                    .filter(([k]) => k !== '_layout')
                    .map(([k, v]) => (
                      <div key={k} style={{ marginBottom: 4 }}>
                        <span style={{ color: '#888', fontSize: 12 }}>
                          {k.replace(/_/g, ' ')}:{' '}
                        </span>
                        <span style={{ fontSize: 14 }}>{String(v)}</span>
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
          style={{ lineHeight: 1.8, color: '#333' }}
          dangerouslySetInnerHTML={{ __html: value }}
        />
      );
    }

    // Long text
    if (typeof value === 'string' && value.length > 100) {
      return (
        <p style={{ lineHeight: 1.8, color: '#333', whiteSpace: 'pre-wrap', margin: 0 }}>
          {value}
        </p>
      );
    }

    // Default — short string
    return <span style={{ color: '#333' }}>{String(value)}</span>;
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        gap: '12px 24px',
        paddingBottom: 20,
        borderBottom: '1px solid #f5f5f5',
        marginBottom: 20,
      }}
    >
      <div style={{ color: '#888', fontSize: 13, paddingTop: 2, fontWeight: 500 }}>
        {label}
      </div>
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
      <div style={{ marginBottom: 24, fontSize: 14, color: '#888' }}>
        <Link href={`/${params.type}`} style={{ color: '#1677ff', textDecoration: 'none' }}>
          {typeLabel}
        </Link>
        {' / '}
        <span>{entry.slug}</span>
      </div>

      {/* Title */}
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111', marginBottom: 8 }}>
        {title}
      </h1>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 40, color: '#bbb', fontSize: 13 }}>
        <span>Published {new Date(entry.createdAt).toLocaleDateString()}</span>
        {entry.updatedAt !== entry.createdAt && (
          <span>Updated {new Date(entry.updatedAt).toLocaleDateString()}</span>
        )}
        <span
          style={{
            background: '#f0f5ff',
            color: '#1677ff',
            padding: '1px 8px',
            borderRadius: 4,
          }}
        >
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
            GET {BACKEND}/api/{params.type}/{params.slug}
          </code>
          {' · '}
          <Link
            href={`/api/${params.type}/${params.slug}`}
            style={{ color: '#1677ff', fontSize: 12 }}
          >
            View JSON ↗
          </Link>
        </p>
      </div>
    </div>
  );
}
