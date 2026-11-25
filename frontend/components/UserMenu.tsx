'use client';

import { useRouter } from 'next/navigation';
import { LogOut, ShieldAlert, UserRound } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { useAuth } from '@/context/AuthContext';
import { displayName, initials } from '@/lib/user-display';
import { roleBadgeColor } from '@/lib/custom-roles';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Avatar in the top bar: who you are, your profile, sign out.
 * While 2FA is off it carries an amber dot and the menu links to the 2FA card —
 * unlike the dashboard reminder, this can't be snoozed.
 */
export function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const { user } = useAuth();
  const router = useRouter();
  if (!user) return null;
  const twoFactorOff = user.twoFactorEnabled === false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={twoFactorOff ? t('accountMenuTwoFactorOff') : t('accountMenu')}
          title={twoFactorOff ? `${displayName(user)} · ${t('twoFactorOff')}` : displayName(user)}
          className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary ring-offset-background transition-colors hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {initials(user)}
          {twoFactorOff && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-background"
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          {/* A person's name is data — shown as stored */}
          <p className="truncate text-sm font-semibold text-foreground">{displayName(user)}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <span className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${roleBadgeColor(user.customRole ?? user.role)}`}>
            {/* A custom role's name is data — shown as stored */}
            {user.customRole ?? tc(`roles.${user.role ?? 'viewer'}`)}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {twoFactorOff && (
          <>
            <DropdownMenuItem
              className="items-start gap-2 text-sm text-amber-600 focus:text-amber-600 dark:text-amber-400 dark:focus:text-amber-400"
              onSelect={() => router.push('/profile#two-factor')}
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium">{t('twoFactorOff')}</span>
                <span className="block text-xs text-muted-foreground">{t('twoFactorTurnOn')}</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className="gap-2 text-sm" onSelect={() => router.push('/profile')}>
          <UserRound className="h-4 w-4" /> {t('profile')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 text-sm text-destructive focus:text-destructive" onSelect={onSignOut}>
          <LogOut className="h-4 w-4" /> {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
