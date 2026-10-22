'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  ShieldCheck,
  Settings2,
  Mail,
  Shield,
  KeyRound,
  Copy,
  Check,
  QrCode,
  Lock,
  Loader2,
  UserCog,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useTranslations } from 'use-intl';
import AdminGuard from '@/components/AdminGuard';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { roleBadgeColor, roleLabel, useRoleList } from '@/lib/custom-roles';

interface User {
  id: number;
  email: string;
  role: string;
  createdAt: string;
}

interface TwoFactorSetupData {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
  hashedRecoveryCodes: string[];
}

export default function UsersPage() {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const tr = useTranslations('roles');
  const router = useRouter();
  const { user: me } = useAuth();
  const { roles, customRoles } = useRoleList();
  const labelOf = (name: string) => roleLabel(name, roles, tc);

  // Built-ins, then custom roles — rendered inline so the Select sees every item
  const roleOptions = () => (
    <>
      <SelectItem value="admin">{tc('roles.admin')}</SelectItem>
      <SelectItem value="editor">{tc('roles.editor')}</SelectItem>
      <SelectItem value="contributor">{tc('roles.contributor')}</SelectItem>
      <SelectItem value="viewer">{tc('roles.viewer')}</SelectItem>
      {customRoles.length > 0 && (
        <>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>{tr('customGroup')}</SelectLabel>
            {customRoles.map((r) => (
              <SelectItem key={r.name} value={r.name}>{r.label}</SelectItem>
            ))}
          </SelectGroup>
        </>
      )}
    </>
  );
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // New user form
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [creating, setCreating] = useState(false);

  // Per-user invite loading state
  const [inviting, setInviting] = useState<number | null>(null);

  // Change own password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

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

  const load = () => {
    setLoading(true);
    api.get('/users')
      .then((r) => setUsers(r.data))
      .catch(() => toast.error(t('toasts.loadFailed')))
      .finally(() => setLoading(false));
  };

  const load2faStatus = () => {
    setTwoFactorLoading(true);
    api.get('/auth/2fa/status')
      .then((r) => setTwoFactorEnabled(r.data.enabled))
      .catch(() => {})
      .finally(() => setTwoFactorLoading(false));
  };

  useEffect(() => {
    load();
    load2faStatus();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post('/users', { email, role });
      if (res.data?.inviteUrl) {
        try { await navigator.clipboard.writeText(res.data.inviteUrl); } catch { /* clipboard may be blocked */ }
        toast.success(t('toasts.createdNoEmail'), {
          description: t('toasts.createdInviteCopied', { email, url: res.data.inviteUrl }),
          duration: 20000,
        });
      } else {
        toast.success(t('toasts.inviteSent', { email }));
      }
      setEmail(''); setRole('editor');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (id: number, newRole: string) => {
    try {
      await api.put(`/users/${id}/role`, { role: newRole });
      toast.success(t('toasts.roleUpdated'));
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.roleUpdateFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      toast.success(t('toasts.deleted'));
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.deleteFailed'));
    }
  };

  const handleSendInvite = async (id: number, email: string) => {
    setInviting(id);
    try {
      const res = await api.post(`/users/${id}/invite`);
      if (res.data?.inviteUrl) {
        try { await navigator.clipboard.writeText(res.data.inviteUrl); } catch { /* clipboard */ }
        toast.success(t('toasts.noEmailServer'), {
          description: t('toasts.inviteCopied', { email, url: res.data.inviteUrl }),
          duration: 20000,
        });
      } else {
        toast.success(t('toasts.inviteSent', { email }));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.inviteFailed'));
    } finally {
      setInviting(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPw(true);
    try {
      await api.put('/users/me/password', { currentPassword: currentPw, newPassword: newPw });
      toast.success(t('toasts.passwordUpdated'));
      setCurrentPw(''); setNewPw('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.passwordUpdateFailed'));
    } finally {
      setChangingPw(false);
    }
  };

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
      await api.post('/auth/2fa/enable', {
        secret: setupData.secret,
        code: verifyCode.trim(),
        recoveryCodes: setupData.hashedRecoveryCodes,
      });
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
      await api.post('/auth/2fa/disable', { code: disableCode.trim() });
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
    <AdminGuard>
    <div className="space-y-6 w-full">

      {/* ── User list ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('list.title')}</CardTitle>
          <CardDescription>{t('list.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('list.email')}</TableHead>
                <TableHead>{t('list.role')}</TableHead>
                <TableHead>{t('list.joined')}</TableHead>
                <TableHead className="text-right">{tc('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t('list.empty')}</TableCell></TableRow>
              ) : users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.email}
                    {u.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">{t('list.you')}</span>}
                  </TableCell>
                  <TableCell>
                    {u.id === me?.id ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(u.role)}`}>
                        {labelOf(u.role)}
                      </span>
                    ) : (
                      <Select value={u.role} onValueChange={(v: string | null) => v && handleRoleChange(u.id, v)}>
                        <SelectTrigger className="h-7 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions()}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={t('list.viewPermissions', { role: labelOf(u.role) })}
                        onClick={() => router.push('/users/permissions?tab=content-types')}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                      </Button>
                      {u.id !== me?.id && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={t('list.sendInvite')}
                            disabled={inviting === u.id}
                            onClick={() => handleSendInvite(u.id, u.email)}
                          >
                            {inviting === u.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Mail className="h-3.5 w-3.5" />}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger render={
                              <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" />
                            }>
                              <Trash2 className="h-3.5 w-3.5" />
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('list.deleteTitle', { email: u.email })}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('list.deleteDescription')}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                                <AlertDialogAction variant="destructive" onClick={() => handleDelete(u.id)}>
                                  {tc('delete')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Role guide ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> {t('roleGuide.title')}</CardTitle>
            <div className="flex items-center gap-3">
              <a href="/users/roles" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <UserCog className="h-3.5 w-3.5" /> {tr('manage')}
              </a>
              <a href="/users/permissions" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <Settings2 className="h-3.5 w-3.5" /> {t('roleGuide.manage')}
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              'admin', 'editor', 'contributor', 'viewer',
            ].map((r) => (
              <div key={r} className="space-y-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(r)}`}>
                  {tc(`roles.${r}`)}
                </span>
                <ul className="space-y-1">
                  {(['p1', 'p2', 'p3', 'p4'] as const).map((p) => (
                    <li key={p} className="text-xs text-muted-foreground">• {t(`roleGuide.${r}.${p}`)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Invite user ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> {t('add.title')}</CardTitle>
          <CardDescription>{t('add.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2 space-y-1">
              <Label>{t('list.email')}</Label>
              <Input type="email" placeholder="editor@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>{t('list.role')}</Label>
              <Select value={role} onValueChange={(v: string | null) => v && setRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roleOptions()}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <Button type="submit" disabled={creating}>
                <Plus className="h-4 w-4 mr-1.5" />
                {creating ? t('add.sending') : t('add.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

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

      {/* ── Change own password ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('password.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1">
              <Label>{t('password.current')}</Label>
              <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>{t('password.new')}</Label>
              <Input type="password" placeholder={t('password.newPlaceholder')} value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" disabled={changingPw}>
              {changingPw ? t('password.updating') : t('password.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
    </AdminGuard>
  );
}
