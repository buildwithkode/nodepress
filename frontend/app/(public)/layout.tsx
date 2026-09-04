import Link from 'next/link';
import PublicHeader, { NavItem } from '@/components/PublicHeader';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001';

async function getContentTypes(): Promise<NavItem[]> {
  try {
    const res = await fetch(`${BACKEND}/api/content-types`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter(
        (ct: any) =>
          !ct.name.startsWith('test_') &&
          ct.name !== 'orders' &&
          ct.name !== 'coupons' &&
          ct.name !== 'article'
      )
      .map((ct: any) => ({
        name: ct.name,
        label: ct.displayName || ct.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        href: `/${ct.name}`,
      }));
  } catch {
    return [];
  }
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const publicTypes = await getContentTypes();

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col justify-between text-gray-900">
      {/* Header */}
      <PublicHeader types={publicTypes} />

      {/* Content Area */}
      <main className="max-w-4xl w-full mx-auto px-4 sm:px-8 py-10 flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/70 bg-white py-8 px-6 text-center text-xs text-gray-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="m-0">© 2026 NodePress Headless CMS. Production-grade content engine.</p>
          <div className="flex flex-wrap items-center justify-center gap-3 text-gray-400">
            {publicTypes.map((ct) => (
              <Link key={ct.name} href={ct.href} className="hover:text-gray-600 no-underline">
                {ct.label}
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
