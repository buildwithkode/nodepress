import Link from 'next/link';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 px-8 py-3 flex items-center justify-between">
        <span className="font-bold text-lg text-blue-600">NodePress</span>
        <Link
          href="/"
          className="text-xs text-gray-500 border border-gray-200 rounded px-3 py-1 hover:bg-gray-50 hover:text-gray-700 transition-colors no-underline"
        >
          Admin Panel →
        </Link>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-10">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-100 text-center py-6 text-xs text-gray-400">
        Powered by NodePress CMS
      </footer>
    </div>
  );
}
