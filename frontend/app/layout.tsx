import type { Metadata } from 'next';
import { AuthProvider } from '../context/AuthContext';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'NodePress CMS',
  description: 'Headless CMS Admin Panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
