'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { canManageSettings } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  LayoutDashboard,
  Layers,
  FileText,
  Image,
  Key,
  ArrowRight,
  BookOpen,
  ClipboardList,
  Users,
  ScrollText,
  Zap,
} from 'lucide-react';

const ALL_NAV_GROUPS = [
  {
    label: 'Content',
    adminOnly: false,
    items: [
      { href: '/',              label: 'Dashboard',     icon: LayoutDashboard },
      { href: '/content-types', label: 'Content Types', icon: Layers },
      { href: '/entries',       label: 'Entries',        icon: FileText },
      { href: '/forms',         label: 'Forms',          icon: ClipboardList },
    ],
  },
  {
    label: 'Assets',
    adminOnly: false,
    items: [
      { href: '/media', label: 'Media', icon: Image },
    ],
  },
  {
    label: 'Developer',
    adminOnly: true,
    items: [
      { href: '/api-keys',  label: 'API Keys',  icon: Key },
      { href: '/webhooks',  label: 'Webhooks',  icon: Zap },
      { href: '/audit-log', label: 'Audit Log', icon: ScrollText },
    ],
  },
  {
    label: 'Team',
    adminOnly: true,
    items: [
      { href: '/users', label: 'Users', icon: Users },
    ],
  },
  {
    label: 'Help',
    adminOnly: false,
    items: [
      { href: '/docs', label: 'Documentation', icon: BookOpen },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const admin = canManageSettings(user?.role);
  const navGroups = ALL_NAV_GROUPS.filter((g) => !g.adminOnly || admin);

  const [siteName, setSiteName] = useState('NodePress');
  useEffect(() => {
    const stored = localStorage.getItem('np_site_name');
    if (stored) setSiteName(stored);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const allNavItems = navGroups.flatMap((g) => g.items);
  const pageTitle = allNavItems
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || (pathname?.startsWith(item.href + '/') ?? false))
    ?.label ?? 'Dashboard';

  return (
    <div className="flex min-h-screen bg-background">

      {/* ── Sidebar ── */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col bg-sidebar border-r border-sidebar-border">

        {/* App name */}
        <div className="flex items-center px-4 h-14 border-b border-sidebar-border shrink-0">
          <span className="font-semibold text-sm text-sidebar-foreground">{siteName}</span>
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
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        isActive
                          ? buttonVariants({ variant: 'default', size: 'sm' }) +
                            ' w-full justify-start bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90'
                          : 'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User info + sign out */}
        <div className="px-3 py-4 border-t border-sidebar-border shrink-0">
          <div className="mb-4 px-1">
            <p className="text-sm font-bold text-sidebar-foreground truncate">
              {user?.email?.split('@')[0] ?? 'User'}
            </p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {user?.email ?? '—'}
            </p>
            <span className={`inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
              user?.role === 'admin'
                ? 'border-yellow-500/60 text-yellow-400'
                : user?.role === 'editor'
                ? 'border-blue-500/60 text-blue-400'
                : 'border-muted-foreground/40 text-muted-foreground'
            }`}>
              {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Viewer'}
            </span>
          </div>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start gap-1.5 px-2 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-border/50"
          >
            <ArrowRight className="h-4 w-4 shrink-0" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="sticky top-0 z-10 h-14 bg-background/80 backdrop-blur-sm border-b border-border flex items-center justify-between px-6">
          <h1 className="text-base font-semibold text-foreground">{pageTitle}</h1>
          <ThemeToggle />
        </div>
        <div className="flex-1 bg-muted/20 p-4 md:p-6">
          <ErrorBoundary label={pageTitle}>
            {children}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
