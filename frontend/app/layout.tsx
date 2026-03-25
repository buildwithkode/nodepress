import type { Metadata } from 'next';
import { AuthProvider } from '../context/AuthContext';
import { PluginProvider } from '../context/PluginContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';
import './globals.css';
export const metadata: Metadata = {
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
