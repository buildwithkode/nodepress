import type { Metadata } from 'next';
import { AuthProvider } from '../context/AuthContext';
import { PluginProvider } from '../context/PluginContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';
import './globals.css';
// metadataBase makes relative OG/Twitter image URLs and canonical links
// absolute. Derived from SITE_URL (the public site origin); falls back to the
// local dev port. Without this, an uploaded OG image (/uploads/…) would resolve
// to localhost in production.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:5173'),
  title: 'NodePress CMS',
  description: 'Headless CMS Admin Panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <TooltipProvider>
            <PluginProvider>
              <AuthProvider>{children}</AuthProvider>
            </PluginProvider>
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
