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
  Loader2,
  UserCog,
  UserRound,
} from 'lucide-react';
import { useTranslations } from 'use-intl';
import AdminGuard from '@/components/AdminGuard';
import api from '@/lib/axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { roleBadgeColor, roleLabel, useRoleList } from '@/lib/custom-roles';
import { useAccess } from '@/lib/use-access';
import { RoleAccessSummary } from '@/components/RoleAccessSummary';

interface User {
  id: number;
  email: string;
  name?: string | null;
  role: string;
  createdAt: string;
}

export default function UsersPage() {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const tr = useTranslations('roles');
  const router = useRouter();
  const { user: me } = useAuth();
  const editable = useAccess().canEdit('users');
  const isAdmin = me?.role === 'admin';
  // Only admins change admin accounts or give the admin role (the API refuses others)
  const canManage = (u: { id: number; role: string }) => editable && u.id !== me?.id && (isAdmin || u.role !== 'admin');
  const { roles, customRoles } = useRoleList();
  const labelOf = (name: string) => roleLabel(name, roles, tc);

  // Built-ins, then custom roles — rendered inline so the Select sees every item
  const roleOptions = () => (
    <>
      {isAdmin && <SelectItem value="admin">{tc('roles.admin')}</SelectItem>}
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
  const [addOpen, setAddOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/users')
      .then((r) => setUsers(r.data))
      .catch(() => toast.error(t('toasts.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
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
      setEmail(''); setRole('editor'); setAddOpen(false);
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

  return (
    <AdminGuard module="users">
    <div className="space-y-6 w-full">

      {/* ── User list ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>{t('list.title')}</CardTitle>
            <CardDescription>{t('list.description')}</CardDescription>
          </div>
          {editable && (
            <Button size="sm" onClick={() => setAddOpen(true)} className="shrink-0">
              <Plus className="h-4 w-4 mr-1.5" /> {t('add.open')}
            </Button>
          )}
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
                    {u.name ? (
                      <>
                        {/* A person's name is data — shown as stored */}
                        {u.name}
                        {u.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">{t('list.you')}</span>}
                        <span className="block text-xs font-normal text-muted-foreground">{u.email}</span>
                      </>
                    ) : (
                      <>
                        {u.email}
                        {u.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">{t('list.you')}</span>}
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {!canManage(u) ? (
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
                      {u.id === me?.id && (
                        <Button variant="ghost" size="icon-sm" title={t('profile.open')} aria-label={t('profile.open')} onClick={() => router.push('/profile')}>
                          <UserRound className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={t('list.viewPermissions', { role: labelOf(u.role) })}
                          onClick={() => router.push('/users/permissions')}
                        >
                          <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                        </Button>
                      )}
                      {canManage(u) && (
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
      {isAdmin && (
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
            <RoleAccessSummary labelOf={labelOf} />
          </CardContent>
        </Card>
      )}

      {/* ── Invite user (slide-over) ──────────────────────────────────────── */}
      {editable && (
        <Sheet open={addOpen} onOpenChange={setAddOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{t('add.title')}</SheetTitle>
              <SheetDescription>{t('add.description')}</SheetDescription>
            </SheetHeader>
            <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-4">
              <div className="space-y-1">
                <Label htmlFor="invite-email">{t('list.email')}</Label>
                <Input id="invite-email" type="email" placeholder="editor@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>
              <div className="space-y-1">
                <Label>{t('list.role')}</Label>
                <Select value={role} onValueChange={(v: string | null) => v && setRole(v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roleOptions()}
                  </SelectContent>
                </Select>
              </div>
              <SheetFooter>
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>{tc('cancel')}</Button>
                <Button type="submit" disabled={creating}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  {creating ? t('add.sending') : t('add.submit')}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      )}

    </div>
    </AdminGuard>
  );
}
