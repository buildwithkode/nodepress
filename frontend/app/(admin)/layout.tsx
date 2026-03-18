'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  LayoutDashboard,
  Layers,
  FileText,
  Image,
  Key,
  LogOut,
} from 'lucide-react';

const navItems = [
  { href: '/',              label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/content-types', label: 'Content Types', icon: Layers },
  { href: '/entries',       label: 'Entries',       icon: FileText },
  { href: '/media',         label: 'Media',         icon: Image },
  { href: '/api-keys',      label: 'API Keys',      icon: Key },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [siteName, setSiteName] = useState('NodePress');
  useEffect(() => {
    const stored = localStorage.getItem('np_site_name');
    if (stored) setSiteName(stored);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ── */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col bg-[#0f172a]">

        {/* Logo / site name */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-extrabold leading-none">N</span>
          </div>
          <span className="text-white font-semibold text-[15px] truncate">{siteName}</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <button
                key={href}
                onClick={() => router.push(href)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-left',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/5',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Bottom user info */}
        <div className="px-3 py-3 border-t border-white/10">
          <p className="text-[11px] text-white/40 truncate px-1 mb-1">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Right side ── */}
      <div className="flex flex-col flex-1 ml-60 min-h-screen">

        {/* Top header */}
        <header className="sticky top-0 z-10 flex items-center justify-end gap-3 h-14 px-6 bg-white border-b border-gray-200 shadow-sm">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs bg-blue-100 text-blue-700 font-semibold">
              {user?.email?.[0]?.toUpperCase() ?? 'U'}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-gray-700 hidden sm:block">{user?.email}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-900 gap-1.5"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </header>

        {/* Page content */}
        <main className="flex-1 bg-gray-50 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
