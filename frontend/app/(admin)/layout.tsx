'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  LayoutDashboard,
  Layers,
  FileText,
  Image,
  Key,
  LogOut,
} from 'lucide-react';

const navGroups = [
  {
    label: 'Content',
    items: [
      { href: '/',              label: 'Dashboard',    icon: LayoutDashboard },
      { href: '/content-types', label: 'Content Types', icon: Layers },
      { href: '/entries',       label: 'Entries',       icon: FileText },
    ],
  },
  {
    label: 'Assets',
    items: [
      { href: '/media', label: 'Media', icon: Image },
    ],
  },
  {
    label: 'Developer',
    items: [
      { href: '/api-keys', label: 'API Keys', icon: Key },
    ],
  },
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
    <div className="flex min-h-screen bg-background">

      {/* ── Sidebar ── */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-56 flex-col bg-sidebar border-r border-sidebar-border">

        {/* App name + theme toggle */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border shrink-0">
          <span className="font-semibold text-sm text-sidebar-foreground">{siteName}</span>
          <ThemeToggle />
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href;
                  return (
                    <button
                      key={href}
                      onClick={() => router.push(href)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-border/50',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User info + sign out */}
        <div className="px-3 py-4 border-t border-sidebar-border shrink-0">
          <div className="mb-3 px-1">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.email ?? '—'}
            </p>
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border border-yellow-500/50 text-yellow-400 font-medium">
              Admin
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-border/50 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 ml-56 min-h-screen">
        {children}
      </main>
    </div>
  );
}
