'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import api, { saveAccessToken } from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/** Change your own password — opened from the sidebar, so every signed-in user can reach it. */
export function ChangePasswordSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const { user, logout } = useAuth();
  const router = useRouter();
  const mismatch = confirmPw.length > 0 && confirmPw !== newPw;

  const reset = () => { setCurrentPw(''); setNewPw(''); setConfirmPw(''); };

  // Forgot the current password: the normal reset link, to your own address.
  const handleForgot = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: user.email });
      if (res.data?.devResetUrl) {
        try { await navigator.clipboard.writeText(res.data.devResetUrl); } catch { /* clipboard may be blocked */ }
        toast.success(t('toasts.resetLinkCopied'), { description: res.data.devResetUrl, duration: 20000 });
      } else {
        toast.success(t('toasts.resetLinkSent', { email: user.email }), { description: t('password.resetHint'), duration: 10000 });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.resetLinkFailed'));
    } finally {
      setSendingReset(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) return;
    setSaving(true);
    try {
      const res = await api.put('/users/me/password', { currentPassword: currentPw, newPassword: newPw });
      // The change ended every session, this one too; the response starts a new one for this browser
      if (res.data?.access_token) saveAccessToken(res.data.access_token);
      toast.success(t('toasts.passwordUpdated'), { description: t('toasts.otherDevicesSignedOut') });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.passwordUpdateFailed'));
    } finally {
      setSaving(false);
    }
  };

  // Every login token and refresh cookie of this account stops working, this browser's included.
  const handleSignOutAll = async () => {
    setSigningOutAll(true);
    try {
      await api.post('/auth/logout-all');
      toast.success(t('toasts.signedOutAll'));
      onOpenChange(false);
      logout();
      router.push('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.signOutAllFailed'));
    } finally {
      setSigningOutAll(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('password.title')}</SheetTitle>
          <SheetDescription>{t('password.description')}</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="pw-current">{t('password.current')}</Label>
              <button type="button" onClick={handleForgot} disabled={sendingReset}
                className="text-xs text-destructive underline-offset-4 hover:text-destructive/80 hover:underline disabled:opacity-50">
                {sendingReset ? t('password.sendingReset') : t('password.forgot')}
              </button>
            </div>
            <Input id="pw-current" type="password" autoComplete="current-password" value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pw-new">{t('password.new')}</Label>
            <Input id="pw-new" type="password" autoComplete="new-password" placeholder={t('password.newPlaceholder')}
              value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pw-confirm">{t('password.confirm')}</Label>
            <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)} required minLength={8} aria-invalid={mismatch || undefined} />
            {mismatch && <p className="text-xs text-destructive">{t('password.mismatch')}</p>}
          </div>
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium">{t('password.signOutAllTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('password.signOutAllHint')}</p>
            <Button type="button" variant="outline" size="sm" onClick={handleSignOutAll} disabled={signingOutAll}
              className="text-destructive hover:text-destructive">
              {signingOutAll ? t('password.signingOutAll') : t('password.signOutAll')}
            </Button>
          </div>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>{tc('cancel')}</Button>
            <Button type="submit" disabled={saving || mismatch}>
              {saving ? t('password.updating') : t('password.submit')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
