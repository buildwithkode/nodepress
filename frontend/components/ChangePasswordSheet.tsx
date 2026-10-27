'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
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
  const mismatch = confirmPw.length > 0 && confirmPw !== newPw;

  const reset = () => { setCurrentPw(''); setNewPw(''); setConfirmPw(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) return;
    setSaving(true);
    try {
      await api.put('/users/me/password', { currentPassword: currentPw, newPassword: newPw });
      toast.success(t('toasts.passwordUpdated'));
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.passwordUpdateFailed'));
    } finally {
      setSaving(false);
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
            <Label htmlFor="pw-current">{t('password.current')}</Label>
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
