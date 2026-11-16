'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, X } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

/** "Not now" hides the reminder for this long, per user, in this browser. */
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const snoozeKey = (userId: number) => `np_2fa_reminder:${userId}`;

function snoozedUntil(userId: number): number {
  try {
    return Number(localStorage.getItem(snoozeKey(userId))) || 0;
  } catch {
    return 0; // storage blocked: just show the reminder
  }
}

/** Dashboard nudge to turn on two-step sign-in. Gone once 2FA is on. */
export function TwoFactorReminder() {
  const t = useTranslations('dashboard');
  const { user } = useAuth();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  // Read the snooze after mount: localStorage doesn't exist on the server render.
  useEffect(() => {
    setVisible(!!user && user.twoFactorEnabled === false && snoozedUntil(user.id) < Date.now());
  }, [user]);

  if (!visible || !user) return null;

  const snooze = () => {
    try {
      localStorage.setItem(snoozeKey(user.id), String(Date.now() + SNOOZE_MS));
    } catch { /* storage blocked: hidden until the next visit */ }
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label={t('twoFactorReminder.title')}
      className="relative flex flex-col gap-4 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 pr-10 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/15">
          <ShieldCheck className="h-4 w-4 text-blue-500" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold">{t('twoFactorReminder.title')}</p>
          <p className="text-sm text-muted-foreground">{t('twoFactorReminder.body')}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
        <Button size="sm" onClick={() => router.push('/profile')}>
          {t('twoFactorReminder.setUp')}
        </Button>
        <Button size="sm" variant="ghost" onClick={snooze}>
          {t('twoFactorReminder.notNow')}
        </Button>
      </div>
      <button
        type="button"
        onClick={snooze}
        aria-label={t('twoFactorReminder.notNow')}
        title={t('twoFactorReminder.notNow')}
        className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
