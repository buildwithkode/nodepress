import Link from 'next/link';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {/* Minimal top bar */}
      <header
        style={{
          borderBottom: '1px solid #f0f0f0',
          padding: '12px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#fff',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 18, color: '#1677ff' }}>
          NodePress
        </span>
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: '#666',
            textDecoration: 'none',
            border: '1px solid #d9d9d9',
            padding: '4px 12px',
            borderRadius: 4,
          }}
        >
          Admin Panel →
        </Link>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
        {children}
      </main>

      <footer
        style={{
          borderTop: '1px solid #f0f0f0',
          textAlign: 'center',
          padding: '24px',
          color: '#999',
          fontSize: 13,
        }}
      >
        Powered by NodePress CMS
      </footer>
    </div>
  );
}
