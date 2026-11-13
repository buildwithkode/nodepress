'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Shield, ShieldCheck, KeyRound, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';
import { useTranslations } from 'use-intl';
import api, { saveAccessToken } from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

interface TwoFactorSetupData {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
  hashedRecoveryCodes: string[];
}

/** Turn two-step sign-in on or off for your own account (the profile page). */
export function TwoFactorCard() {
  const t = useTranslations('users');
  const tc = useTranslations('common');

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [enabling2fa, setEnabling2fa] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Disable 2FA modal state
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disabling2fa, setDisabling2fa] = useState(false);

  const load2faStatus = () => {
    setTwoFactorLoading(true);
    api.get('/auth/2fa/status')
      .then((r) => setTwoFactorEnabled(r.data.enabled))
      .catch(() => {})
      .finally(() => setTwoFactorLoading(false));
  };

  useEffect(() => {
    load2faStatus();
  }, []);

  // ── 2FA Handlers ────────────────────────────────────────────────────────────

  const handleStart2faSetup = async () => {
    try {
      const res = await api.get('/auth/2fa/setup');
      setSetupData(res.data);
      const qrDataUrl = await QRCode.toDataURL(res.data.otpauthUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrCodeDataUrl(qrDataUrl);
      setVerifyCode('');
      setCopiedCodes(false);
      setCopiedSecret(false);
      setSetupModalOpen(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.twoFactorSetupFailed'));
    }
  };

  const handleConfirm2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData || !verifyCode.trim()) return;
    setEnabling2fa(true);
    try {
      const res = await api.post('/auth/2fa/enable', {
        secret: setupData.secret,
        code: verifyCode.trim(),
        recoveryCodes: setupData.hashedRecoveryCodes,
      });
      // Turning 2FA on signs out other sessions and cancels the old token: keep the new one
      if (res.data?.access_token) saveAccessToken(res.data.access_token);
      toast.success(t('toasts.twoFactorActivated'));
      setTwoFactorEnabled(true);
      setSetupModalOpen(false);
      setSetupData(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.twoFactorInvalidCode'));
    } finally {
      setEnabling2fa(false);
    }
  };

  const handleDisable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableCode.trim()) return;
    setDisabling2fa(true);
    try {
      const res = await api.post('/auth/2fa/disable', { code: disableCode.trim() });
      if (res.data?.access_token) saveAccessToken(res.data.access_token);
      toast.success(t('toasts.twoFactorDisabled'));
      setTwoFactorEnabled(false);
      setDisableModalOpen(false);
      setDisableCode('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.twoFactorDisableInvalid'));
    } finally {
      setDisabling2fa(false);
    }
  };

  const copyRecoveryCodes = async () => {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.recoveryCodes.join('\n'));
      setCopiedCodes(true);
      toast.success(t('toasts.recoveryCopied'));
      setTimeout(() => setCopiedCodes(false), 3000);
    } catch {
      toast.error(t('toasts.recoveryCopyFailed'));
    }
  };

  const copySecret = async () => {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopiedSecret(true);
      toast.success(t('toasts.secretCopied'));
      setTimeout(() => setCopiedSecret(false), 3000);
    } catch {
      toast.error(t('toasts.secretCopyFailed'));
    }
  };

  return (
    <>
      {/* ── Two-Factor Authentication (2FA) ────────────────────────────────── */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                {t('twoFactor.title')}
              </CardTitle>
              <CardDescription>
                {t('twoFactor.description')}
              </CardDescription>
            </div>
            {!twoFactorLoading && (
              <Badge variant={twoFactorEnabled ? 'default' : 'secondary'} className={twoFactorEnabled ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : ''}>
                {twoFactorEnabled ? tc('enabled') : tc('disabled')}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-card/50 border border-border">
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">
                {twoFactorEnabled ? t('twoFactor.enabledHeading') : t('twoFactor.disabledHeading')}
              </p>
              <p className="text-xs text-muted-foreground">
                {twoFactorEnabled
                  ? t('twoFactor.enabledHelp')
                  : t('twoFactor.disabledHelp')}
              </p>
            </div>
            <div>
              {twoFactorEnabled ? (
                <Button variant="outline" size="sm" onClick={() => { setDisableCode(''); setDisableModalOpen(true); }} className="text-destructive hover:bg-destructive/10">
                  {t('twoFactor.disable')}
                </Button>
              ) : (
                <Button size="sm" onClick={handleStart2faSetup} disabled={twoFactorLoading}>
                  <ShieldCheck className="h-4 w-4 mr-1.5" />
                  {t('twoFactor.enable')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 2FA Setup Dialog ───────────────────────────────────────────────── */}
      <Dialog open={setupModalOpen} onOpenChange={setSetupModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              {t('twoFactor.setupTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('twoFactor.setupDescription')}
            </DialogDescription>
          </DialogHeader>

          {setupData && (
            <form onSubmit={handleConfirm2fa} className="space-y-4">
              {/* QR Code & Secret */}
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-white border border-border">
                {qrCodeDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrCodeDataUrl} alt={t('twoFactor.qrAlt')} className="w-44 h-44 rounded" />
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('twoFactor.manualKey')}</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={setupData.secret} className="font-mono text-xs tracking-wider" />
                  <Button type="button" variant="outline" size="icon" onClick={copySecret}>
                    {copiedSecret ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Recovery Codes */}
              <div className="space-y-1.5 p-3 rounded-lg bg-muted/40 border border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                    {t('twoFactor.recoveryCodes')}
                  </Label>
                  <Button type="button" variant="ghost" size="xs" onClick={copyRecoveryCodes} className="text-xs h-6 px-2">
                    {copiedCodes ? <Check className="h-3 w-3 mr-1 text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
                    {copiedCodes ? tc('copied') : t('twoFactor.copyCodes')}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t('twoFactor.recoveryHelp')}</p>
                <div className="grid grid-cols-2 gap-1 font-mono text-xs text-foreground/80 bg-background/50 p-2 rounded border border-border/50">
                  {setupData.recoveryCodes.map((code) => (
                    <span key={code} className="text-center">{code}</span>
                  ))}
                </div>
              </div>

              {/* 6-Digit Verification */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t('twoFactor.verificationCode')}</Label>
                <Input
                  placeholder={t('twoFactor.verificationPlaceholder')}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  maxLength={6}
                  autoFocus
                  className="font-mono text-center tracking-widest text-base"
                  required
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="ghost" onClick={() => setSetupModalOpen(false)}>
                  {tc('cancel')}
                </Button>
                <Button type="submit" disabled={enabling2fa || verifyCode.trim().length !== 6}>
                  {enabling2fa ? t('twoFactor.activating') : t('twoFactor.activate')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 2FA Disable Dialog ─────────────────────────────────────────────── */}
      <Dialog open={disableModalOpen} onOpenChange={setDisableModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('twoFactor.disableTitle')}</DialogTitle>
            <DialogDescription>
              {t('twoFactor.disableDescription')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleDisable2fa} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('twoFactor.disableCodeLabel')}</Label>
              <Input
                placeholder={t('twoFactor.disableCodePlaceholder')}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                autoFocus
                className="font-mono text-center tracking-widest"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setDisableModalOpen(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" variant="destructive" disabled={disabling2fa || !disableCode.trim()}>
                {disabling2fa ? t('twoFactor.disabling') : t('twoFactor.disable')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </>
  );
}
