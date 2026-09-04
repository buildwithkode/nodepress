import Link from 'next/link';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001';

async function getContentTypes() {
  try {
    const res = await fetch(`${BACKEND}/api/content-types`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const allTypes = await getContentTypes();

  // Filter for user-facing public content types (exclude test_ types, orders, coupons)
  const publicTypes = allTypes
    .filter(
      (ct: any) =>
        !ct.name.startsWith('test_') &&
        ct.name !== 'orders' &&
        ct.name !== 'coupons' &&
        ct.name !== 'article' // Deduplicate singular 'article' when 'articles' exists
    )
    .slice(0, 5); // Keep header clean with up to 5 top types

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col justify-between text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-6 sm:px-10 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/posts" className="flex items-center gap-2 text-gray-900 no-underline font-extrabold text-lg tracking-tight">
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm font-black shadow-sm">
              N
            </span>
            <span>NodePress <span className="text-blue-600 text-xs font-semibold uppercase tracking-wider ml-1">Live</span></span>
          </Link>
          <nav className="hidden sm:flex items-center gap-4 text-xs font-medium text-gray-600">
            {publicTypes.length > 0 ? (
              publicTypes.map((ct: any) => {
                const label = ct.displayName || ct.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                return (
                  <Link
                    key={ct.name}
                    href={`/${ct.name}`}
                    className="hover:text-blue-600 transition-colors no-underline"
                  >
                    {label}
                  </Link>
                );
              })
            ) : (
              <>
                <Link href="/posts" className="hover:text-blue-600 transition-colors no-underline">
                  Posts
                </Link>
                <Link href="/articles" className="hover:text-blue-600 transition-colors no-underline">
                  Articles
                </Link>
              </>
            )}
            <Link href="/docs" className="hover:text-blue-600 transition-colors no-underline">
              Docs
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/docs"
            className="text-xs text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg transition-colors no-underline hidden sm:block"
          >
            API Docs
          </Link>
          <Link
            href="/"
            className="text-xs font-medium bg-gray-900 hover:bg-black text-white rounded-lg px-3.5 py-1.5 shadow-sm transition-all no-underline"
          >
            Admin Panel →
          </Link>
        </div>
      </header>

      {/* Content Area */}
      <main className="max-w-4xl w-full mx-auto px-6 sm:px-8 py-10 flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/70 bg-white py-8 px-6 text-center text-xs text-gray-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="m-0">© 2026 NodePress Headless CMS. Production-grade content engine.</p>
          <div className="flex items-center gap-4 text-gray-400">
            {publicTypes.map((ct: any) => (
              <Link key={ct.name} href={`/${ct.name}`} className="hover:text-gray-600 no-underline">
                {ct.displayName || ct.name}
              </Link>
            ))}
            <span>•</span>
            <Link href="/docs" className="hover:text-gray-600 no-underline">API</Link>
            <span>•</span>
            <Link href="/login" className="hover:text-gray-600 no-underline">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
