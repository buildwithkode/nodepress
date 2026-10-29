'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { usePlugins } from '../../context/PluginContext';
import { useBrand } from '../../context/BrandContext';
import { PluginInitializer } from '@/components/PluginInitializer';
import { canView, moduleForPath } from '@/lib/access';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminLanguageSwitcher } from '@/components/AdminLanguageSwitcher';
import { useTranslations } from 'use-intl';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  LayoutDashboard,
  Layers,
  FileText,
  Image,
  Key,
  BookOpen,
  ClipboardList,
  Users,
  ScrollText,
  Zap,
  Puzzle,
  Code2,
  Loader2,
  Palette,
  Menu,
  X, ListChecks, Languages, Package, Mail, Signpost, Blocks, UserCog, Upload, ListOrdered, LogOut } from 'lucide-react';

interface NavLink { href: string; label: string; icon: React.ComponentType<{ className?: string }> }
interface NavGroup { label: string; items: NavLink[]; externalLinks?: NavLink[] }

/**
 * Labels are keys into messages/<locale>/nav.json (groups.* and items.*).
 * Items show when the role can view their module (lib/access.ts moduleForPath);
 * a group with no visible items is hidden.
 */
const ALL_NAV_GROUPS: Array<{
  labelKey: string;
  items: Array<{ href: string; labelKey: string; icon: NavLink['icon'] }>;
  externalLinks?: Array<{ href: string; labelKey: string; icon: NavLink['icon'] }>;
}> = [
  {
    labelKey: 'content',
    items: [
      { href: '/',              labelKey: 'dashboard',     icon: LayoutDashboard },
      { href: '/content-types', labelKey: 'contentTypes', icon: Layers },
      { href: '/components',    labelKey: 'components',   icon: Blocks },
      { href: '/entries',       labelKey: 'entries',        icon: FileText },
      { href: '/releases',      labelKey: 'releases',       icon: Package },
      { href: '/forms',         labelKey: 'forms',          icon: ClipboardList },
      { href: '/redirects',     labelKey: 'redirects',      icon: Signpost },
    ],
  },
  {
    labelKey: 'assets',
    items: [
      { href: '/media', labelKey: 'media', icon: Image },
    ],
  },
  {
    labelKey: 'developer',
    items: [
      { href: '/plugins',   labelKey: 'plugins',   icon: Puzzle },
      { href: '/api-keys',  labelKey: 'apiKeys',  icon: Key },
      { href: '/webhooks',  labelKey: 'webhooks',  icon: Zap },
      { href: '/jobs',      labelKey: 'jobs',      icon: ListChecks },
      { href: '/audit-log', labelKey: 'auditLog', icon: ScrollText },
    ],
    externalLinks: [
      { href: '/graphql', labelKey: 'graphql', icon: Code2 },
    ],
  },
  {
    labelKey: 'team',
    items: [
      { href: '/users', labelKey: 'users', icon: Users },
      { href: '/users/roles', labelKey: 'roles', icon: UserCog },
    ],
  },
  {
    labelKey: 'settings',
    items: [
      { href: '/brand', labelKey: 'brand', icon: Palette },
      { href: '/languages', labelKey: 'languages', icon: Languages },
      { href: '/server-settings', labelKey: 'serverSettings', icon: Mail },
      { href: '/import', labelKey: 'importer', icon: Upload },
      { href: '/choice-lists', labelKey: 'choiceLists', icon: ListOrdered },
    ],
  },
  {
    labelKey: 'help',
    items: [
      { href: '/docs', labelKey: 'docs', icon: BookOpen },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // All hooks must run unconditionally and in the same order on every render —
  // keep them above the early returns below. (Previously useRouter/usePathname/
  // useState/useEffect sat after the `loading`/`!user` guards, so they were
  // skipped on the loading render and ran on the next one, producing React's
  // "change in the order of Hooks" error.)
  const { user, loading, logout } = useAuth();
  const { navItems: pluginNavItems } = usePlugins();
  const { brand } = useBrand();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = useTranslations('nav');
  const tc = useTranslations('common');

  // Close mobile drawer automatically when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Block the admin UI from rendering until auth is confirmed.
  // This prevents two bad scenarios:
  //   1. Stale np_token (passes middleware but fails /auth/me) briefly flashes the dashboard.
  //   2. Silent refresh in flight — admin content appears before we know if the user is logged in.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Auth resolved but no user — stale token that failed server validation.
  // Interceptor already fired window.location but render one null frame to be safe.
  if (!user) return null;

  const visible = (href: string) => {
    const module = moduleForPath(href);
    return !module || canView(user, module);
  };
  const baseGroups: NavGroup[] = ALL_NAV_GROUPS.map((g) => ({
    label: t(`groups.${g.labelKey}`),
    items: g.items.filter((i) => visible(i.href)).map((i) => ({ ...i, label: t(`items.${i.labelKey}`) })),
    externalLinks: g.externalLinks?.map((i) => ({ ...i, label: t(`items.${i.labelKey}`) })),
  })).filter((g) => g.items.length > 0);

  // Merge plugin-contributed nav items into a 'Plugins' group
  const pluginItems = pluginNavItems.filter((item) =>
    item.adminOnly ? user.role === 'admin' : !item.module || canView(user, item.module));
  const allNavGroups: NavGroup[] = pluginItems.length > 0
    ? [
        ...baseGroups,
        {
          label: t('groups.plugins'),
          items: pluginItems.map((item) => ({ ...item, icon: item.icon ?? Puzzle })),
        },
      ]
    : baseGroups;

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const allNavItems = allNavGroups.flatMap((g) => g.items);
  const pageTitle = allNavItems
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || (pathname?.startsWith(item.href + '/') ?? false))
    ?.label ?? t('items.dashboard');

  return (
    <div className="flex min-h-screen bg-background relative">
      {/* ── Mobile Backdrop Overlay ── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar (Fixed on Desktop, Slide-over Drawer on Mobile) ── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-300 ease-in-out md:translate-x-0 md:z-20',
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        {/* Brand — logo (if set) + name + Mobile Close Button */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {brand.brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.brandLogoUrl} alt={brand.brandName} className="h-6 w-6 rounded object-contain shrink-0" />
            ) : (
              <span className="h-6 w-6 rounded shrink-0" style={{ backgroundColor: 'var(--brand)' }} />
            )}
            <span className="font-semibold text-sm text-sidebar-foreground truncate">{brand.brandName}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground"
            aria-label={t('closeMenu')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          <PluginInitializer />
          {allNavGroups.map((group) => (
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
                      onClick={() => setMobileMenuOpen(false)}
                      style={isActive ? { backgroundColor: 'var(--brand)' } : undefined}
                      className={cn(
                        isActive
                          ? buttonVariants({ variant: 'default', size: 'sm' }) +
                            ' w-full justify-start text-white hover:opacity-90'
                          : 'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </Link>
                  );
                })}
                {group.externalLinks?.map(({ href, label, icon: Icon }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/50 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                    <span className="ml-auto text-[9px] opacity-50">↗</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User info + sign out */}
        <div className="px-3 py-4 border-t border-sidebar-border shrink-0">
          <div className="flex items-start justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="text-sm font-bold text-sidebar-foreground truncate">
                {user?.email?.split('@')[0] ?? t('user')}
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
                {/* A custom role's name is data — shown as stored */}
                {user?.customRole ?? tc(`roles.${user?.role ?? 'viewer'}`)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleLogout}
              title={t('signOut')}
              aria-label={t('signOut')}
              className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ── Main content (Full width on mobile, offset on desktop) ── */}
      <main className="flex-1 md:ml-64 flex flex-col min-h-screen w-full min-w-0">
        {/* Top bar with Mobile Hamburger Button */}
        <div className="sticky top-0 z-30 h-14 bg-background/80 backdrop-blur-sm border-b border-border flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden h-8 w-8 -ml-1 text-foreground"
              aria-label={t('openMenu')}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-base font-semibold text-foreground truncate">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <AdminLanguageSwitcher className="w-auto" />
            <ThemeToggle />
          </div>
        </div>
        {/* overflow-x-clip, not -auto: any other overflow makes this a scroll box, and side panes (position: sticky) would stick to it instead of the window. */}
        <div className="flex-1 bg-muted/20 p-3 sm:p-4 md:p-6 min-w-0 overflow-x-clip">
          <ErrorBoundary label={pageTitle}>
            {children}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
