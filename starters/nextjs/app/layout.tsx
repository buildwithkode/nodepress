import type { Metadata } from 'next';
import Link from 'next/link';
import { draftMode } from 'next/headers';
import { DraftBanner } from '@/components/DraftBanner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Blog', template: '%s · Blog' },
  description: 'A blog powered by NodePress',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const draft = await draftMode();
  return (
    <html lang="en">
      <body>
        {draft.isEnabled && <DraftBanner />}
        <header className="site-header">
          <Link href="/">Blog</Link>
        </header>
        <main>{children}</main>
        <footer className="site-footer">Powered by NodePress</footer>
      </body>
    </html>
  );
}
