'use client';

import { useRouter } from 'next/navigation';
import { LogOut, UserRound } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { useAuth } from '@/context/AuthContext';
import { displayName, initials } from '@/lib/user-display';
import { roleBadgeColor } from '@/lib/custom-roles';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Avatar in the top bar: who you are, your profile, sign out. */
export function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const { user } = useAuth();
  const router = useRouter();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('accountMenu')}
          title={displayName(user)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary ring-offset-background transition-colors hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {initials(user)}
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
