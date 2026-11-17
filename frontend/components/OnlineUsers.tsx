'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import type { Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import { connectRealtime } from '@/lib/realtime-socket';
import { usePresenceDetail, type PresenceDetail } from '@/lib/presence-detail';
import { initials } from '@/lib/user-display';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface OnlineUser {
  id: number;
  name: string;
  role: string;
  path: string;
  detail: PresenceDetail | null;
}

// Fixed colours per person, so someone keeps theirs across pages and tabs
const AVATAR_COLORS = [
  'bg-sky-500/20 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  'bg-rose-500/20 text-rose-700 dark:text-rose-300',
  'bg-violet-500/20 text-violet-700 dark:text-violet-300',
  'bg-teal-500/20 text-teal-700 dark:text-teal-300',
];
const colorOf = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length];
const SHOWN = 3;

function Avatar({ user, className }: { user: OnlineUser; className?: string }) {
  return (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-background',
        colorOf(user.id),
        className,
      )}
    >
      {initials({ name: user.name })}
    </span>
  );
}

/**
 * Avatars of the other people who have the admin open, beside your own in the
 * top bar. Hidden while you're the only one. Click for who is where; pick a
 * person to open the page they're on.
 */
export function OnlineUsers({ pageLabel }: { pageLabel: (path: string) => string }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const detail = usePresenceDetail();
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const hereRef = useRef<{ path: string; detail: PresenceDetail | null }>({ path: '/', detail: null });

  // One connection per tab; it says where it is on connect and after every reconnect
  useEffect(() => {
    if (!user) return;
    const socket = connectRealtime();
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('presence:here', hereRef.current));
    socket.on('presence:list', (msg: { users?: OnlineUser[] }) => setUsers(Array.isArray(msg?.users) ? msg.users : []));
    return () => {
      socket.disconnect();
      socketRef.current = null;
      setUsers([]);
    };
  }, [user?.id]);

  // A new page (or a different entry in the editor): tell the others
  useEffect(() => {
    hereRef.current = { path: `${pathname ?? '/'}${window.location.search}`, detail };
    if (socketRef.current?.connected) socketRef.current.emit('presence:here', hereRef.current);
  }, [pathname, detail?.type, detail?.slug, detail?.locale]);

  const others = users.filter((u) => u.id !== user?.id);
  if (others.length === 0) return null;
  const extra = others.length - SHOWN;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('onlineButton', { count: others.length })}
          title={t('onlineButton', { count: others.length })}
          className="flex items-center rounded-full pr-0.5 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex -space-x-2">
            {others.slice(0, SHOWN).map((u, i) => (
              // On phones only the first face, then the count
              <Avatar key={u.id} user={u} className={i > 0 ? 'hidden sm:flex' : undefined} />
            ))}
          </span>
          {extra > 0 && (
            <span className="ml-1 hidden text-xs font-medium text-muted-foreground sm:inline">+{extra}</span>
          )}
          {others.length > 1 && (
            <span className="ml-1 text-xs font-medium text-muted-foreground sm:hidden">+{others.length - 1}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="font-normal">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            {t('onlineNow')}
          </p>
          <p className="text-xs text-muted-foreground">{t('onlineHint')}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {others.map((u) => (
          <DropdownMenuItem key={u.id} className="items-start gap-2.5 py-2" onSelect={() => router.push(u.path)}>
            <Avatar user={u} className="ring-0" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                {/* A person's name is data — shown as stored */}
                <span className="truncate text-sm font-medium text-foreground">{u.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{tc(`roles.${u.role}`)}</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {pageLabel(u.path)}
                {/* Content type and slug are data */}
                {u.detail && ` › ${u.detail.type} › ${u.detail.slug}${u.detail.locale ? ` (${u.detail.locale.toUpperCase()})` : ''}`}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
