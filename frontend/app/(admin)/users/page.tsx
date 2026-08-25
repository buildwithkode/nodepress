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
} from 'lucide-react';
import QRCode from 'qrcode';
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

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

const ROLE_COLORS: Record<string, string> = {
  admin:       'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  editor:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  contributor: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  viewer:      'bg-muted text-muted-foreground',
};

export default function UsersPage() {
  const router = useRouter();
  const { user: me } = useAuth();
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
      .catch(() => toast.error('Failed to load users'))
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
        toast.success(`User created — no email server configured`, {
          description: `Invite link copied to clipboard. Send it to ${email}: ${res.data.inviteUrl}`,
          duration: 20000,
        });
      } else {
        toast.success(`Invitation sent to ${email}`);
      }
      setEmail(''); setRole('editor');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (id: number, newRole: string) => {
    try {
      await api.put(`/users/${id}/role`, { role: newRole });
      toast.success('Role updated');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update role');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleSendInvite = async (id: number, email: string) => {
    setInviting(id);
    try {
      const res = await api.post(`/users/${id}/invite`);
      if (res.data?.inviteUrl) {
        try { await navigator.clipboard.writeText(res.data.inviteUrl); } catch { /* clipboard */ }
        toast.success(`No email server configured`, {
          description: `Invite link copied. Send it to ${email}: ${res.data.inviteUrl}`,
          duration: 20000,
        });
      } else {
        toast.success(`Invitation sent to ${email}`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send invitation');
    } finally {
      setInviting(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPw(true);
    try {
      await api.put('/users/me/password', { currentPassword: currentPw, newPassword: newPw });
      toast.success('Password updated');
      setCurrentPw(''); setNewPw('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update password');
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
      toast.error(err.response?.data?.message || 'Failed to start 2FA setup');
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
      toast.success('Two-Factor Authentication activated successfully!');
      setTwoFactorEnabled(true);
      setSetupModalOpen(false);
      setSetupData(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid verification code. Please try again.');
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
      toast.success('Two-Factor Authentication disabled');
      setTwoFactorEnabled(false);
      setDisableModalOpen(false);
      setDisableCode('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid 2FA code or recovery code');
    } finally {
      setDisabling2fa(false);
    }
  };

  const copyRecoveryCodes = async () => {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.recoveryCodes.join('\n'));
      setCopiedCodes(true);
      toast.success('Recovery codes copied to clipboard');
      setTimeout(() => setCopiedCodes(false), 3000);
    } catch {
      toast.error('Failed to copy recovery codes');
    }
  };

  const copySecret = async () => {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopiedSecret(true);
      toast.success('Secret key copied');
      setTimeout(() => setCopiedSecret(false), 3000);
    } catch {
      toast.error('Failed to copy secret');
    }
  };

  return (
    <AdminGuard>
    <div className="space-y-6 w-full">

      {/* ── User list ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>Manage who has access to the admin panel and what they can do.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
              ) : users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.email}
                    {u.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell>
                    {u.id === me?.id ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? ROLE_COLORS.viewer}`}>
                        {u.role}
                      </span>
                    ) : (
                      <Select value={u.role} onValueChange={(v: string | null) => v && handleRoleChange(u.id, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="contributor">Contributor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
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
                        title={`View ${u.role} Permissions Matrix`}
                        onClick={() => router.push('/users/permissions?tab=content-types')}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                      </Button>
                      {u.id !== me?.id && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Send invitation email"
                            disabled={inviting === u.id}
                            onClick={() => handleSendInvite(u.id, u.email)}
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger render={
                              <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" />
                            }>
                              <Trash2 className="h-3.5 w-3.5" />
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {u.email}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove their access. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction variant="destructive" onClick={() => handleDelete(u.id)}>
                                  Delete
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
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Role Permissions</CardTitle>
            <a href="/users/permissions" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <Settings2 className="h-3.5 w-3.5" /> Manage permissions
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              { role: 'Admin',       perms: ['Full access to everything', 'Manage users & roles', 'Content types & API keys', 'Audit log & webhooks'] },
              { role: 'Editor',      perms: ['Create / edit / delete entries', 'Publish & archive entries', 'Forms, media upload/delete', 'Read content types'] },
              { role: 'Contributor', perms: ['Create & edit entries', 'Cannot delete entries', 'Cannot publish or archive', 'Media upload only'] },
              { role: 'Viewer',      perms: ['Read-only dashboard', 'View entries & forms', 'View media library', 'Cannot modify anything'] },
            ].map(({ role: r, perms }) => (
              <div key={r} className="space-y-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[r.toLowerCase()] ?? ROLE_COLORS.viewer}`}>
                  {r}
                </span>
                <ul className="space-y-1">
                  {perms.map((p) => (
                    <li key={p} className="text-xs text-muted-foreground">• {p}</li>
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
          <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add User</CardTitle>
          <CardDescription>Invite a teammate by email — they'll get a link to set their own password. No password needed here.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2 space-y-1">
              <Label>Email</Label>
              <Input type="email" placeholder="editor@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v: string | null) => v && setRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="contributor">Contributor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <Button type="submit" disabled={creating}>
                <Plus className="h-4 w-4 mr-1.5" />
                {creating ? 'Sending invite…' : 'Send Invite'}
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
                Two-Factor Authentication (2FA)
              </CardTitle>
              <CardDescription>
                Protect your account with an extra security layer using Google Authenticator, 1Password, or Authy.
              </CardDescription>
            </div>
            {!twoFactorLoading && (
              <Badge variant={twoFactorEnabled ? 'default' : 'secondary'} className={twoFactorEnabled ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : ''}>
                {twoFactorEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-card/50 border border-border">
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">
                {twoFactorEnabled ? '2FA is currently protecting your account' : 'Enhance your login security with TOTP'}
              </p>
              <p className="text-xs text-muted-foreground">
                {twoFactorEnabled
                  ? 'You will be prompted for a 6-digit code or emergency backup recovery code upon login.'
                  : 'Requires scanning a QR code with an authenticator app and keeping backup recovery codes.'}
              </p>
            </div>
            <div>
              {twoFactorEnabled ? (
                <Button variant="outline" size="sm" onClick={() => { setDisableCode(''); setDisableModalOpen(true); }} className="text-destructive hover:bg-destructive/10">
                  Disable 2FA
                </Button>
              ) : (
                <Button size="sm" onClick={handleStart2faSetup} disabled={twoFactorLoading}>
                  <ShieldCheck className="h-4 w-4 mr-1.5" />
                  Enable 2FA
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
              Set Up Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              Scan the QR code with Google Authenticator, 1Password, or Authy.
            </DialogDescription>
          </DialogHeader>

          {setupData && (
            <form onSubmit={handleConfirm2fa} className="space-y-4">
              {/* QR Code & Secret */}
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-white border border-border">
                {qrCodeDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrCodeDataUrl} alt="2FA QR Code" className="w-44 h-44 rounded" />
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Manual Entry Key</Label>
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
                    Emergency Backup Recovery Codes
                  </Label>
                  <Button type="button" variant="ghost" size="xs" onClick={copyRecoveryCodes} className="text-xs h-6 px-2">
                    {copiedCodes ? <Check className="h-3 w-3 mr-1 text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
                    {copiedCodes ? 'Copied' : 'Copy Codes'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Save these codes safely. If you lose your authenticator app, each code can be used once to log in.</p>
                <div className="grid grid-cols-2 gap-1 font-mono text-xs text-foreground/80 bg-background/50 p-2 rounded border border-border/50">
                  {setupData.recoveryCodes.map((code) => (
                    <span key={code} className="text-center">{code}</span>
                  ))}
                </div>
              </div>

              {/* 6-Digit Verification */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Verification Code</Label>
                <Input
                  placeholder="Enter 6-digit code"
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
                  Cancel
                </Button>
                <Button type="submit" disabled={enabling2fa || verifyCode.trim().length !== 6}>
                  {enabling2fa ? 'Activating…' : 'Activate 2FA'}
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
            <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Enter a 6-digit code from your authenticator app or an emergency recovery code to confirm.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleDisable2fa} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Authenticator or Recovery Code</Label>
              <Input
                placeholder="6-digit code or XXXX-XXXX"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                autoFocus
                className="font-mono text-center tracking-widest"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setDisableModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={disabling2fa || !disableCode.trim()}>
                {disabling2fa ? 'Disabling…' : 'Disable 2FA'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Change own password ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Change Your Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1">
              <Label>Current Password</Label>
              <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>New Password</Label>
              <Input type="password" placeholder="Min 8 chars" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} />
            </div>
            <Button type="submit" disabled={changingPw}>
              {changingPw ? 'Updating…' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
    </AdminGuard>
  );
}
