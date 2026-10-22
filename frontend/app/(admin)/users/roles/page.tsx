'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Lock, Pencil, Plus, Settings2, Trash2, UserCog } from 'lucide-react';
import { useTranslations } from 'use-intl';
import AdminGuard from '@/components/AdminGuard';
import api from '@/lib/axios';
import {
  BASE_ROLE_NAMES, RoleInfo, roleBadgeColor, useRoleList,
} from '@/lib/custom-roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/** Same rule as the backend's normalizeRoleName(). */
const normalizeName = (raw: string) =>
  raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

interface FormState {
  name: string;
  label: string;
  description: string;
  baseRole: string;
}

const EMPTY_FORM: FormState = { name: '', label: '', description: '', baseRole: 'contributor' };

export default function RolesPage() {
  const t = useTranslations('roles');
  const tc = useTranslations('common');
  const router = useRouter();
  const { roles, loading, reload } = useRoleList();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RoleInfo | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<RoleInfo | null>(null);

  const normalized = useMemo(() => normalizeName(form.name), [form.name]);

  const baseLabel = (name: string) => (tc.has(`roles.${name}`) ? tc(`roles.${name}`) : name);
  const builtInDescription = (name: string) =>
    t.has(`builtInDescriptions.${name}`) ? t(`builtInDescriptions.${name}`) : '';

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (role: RoleInfo) => {
    setEditing(role);
    setForm({ name: role.name, label: role.label, description: role.description ?? '', baseRole: role.baseRole });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/roles/${editing.name}`, {
          label: form.label,
          description: form.description || null,
          baseRole: form.baseRole,
        });
        toast.success(t('toasts.updated'));
      } else {
        await api.post('/roles', {
          name: form.name,
          label: form.label,
          ...(form.description && { description: form.description }),
          baseRole: form.baseRole,
        });
        toast.success(t('toasts.created'));
      }
      setDialogOpen(false);
      reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/roles/${deleting.name}`);
      toast.success(t('toasts.deleted'));
      reload();
    } catch (err: any) {
      const count = err.response?.data?.userCount;
      toast.error(typeof count === 'number'
        ? t('toasts.inUse', { count })
        : err.response?.data?.message || t('toasts.deleteFailed'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AdminGuard>
      <div className="space-y-6 w-full">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => router.push('/users')}>
            <ArrowLeft className="h-4 w-4" /> {t('backToUsers')}
          </Button>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium">{t('title')}</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/users/permissions?tab=content-types')}>
              <Settings2 className="h-3.5 w-3.5 mr-1.5" /> {t('managePermissions')}
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> {t('newRole')}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserCog className="h-4 w-4" /> {t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.role')}</TableHead>
                    <TableHead>{t('list.basedOn')}</TableHead>
                    <TableHead>{t('list.users')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('list.description')}</TableHead>
                    <TableHead className="text-right">{tc('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : roles.map((r) => (
                    <TableRow key={r.name}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(r.name)}`}>
                            {r.builtIn ? baseLabel(r.name) : r.label}
                          </span>
                          {r.builtIn
                            ? <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-2.5 w-2.5" /> {t('list.builtIn')}</Badge>
                            : <code className="text-xs text-muted-foreground">{r.name}</code>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.builtIn ? <span className="text-muted-foreground">—</span> : baseLabel(r.baseRole)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t('list.userCount', { count: r.userCount })}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-md truncate">
                        {r.builtIn ? builtInDescription(r.name) : r.description}
                      </TableCell>
                      <TableCell className="text-right">
                        {!r.builtIn && (
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-sm" title={t('list.edit')} onClick={() => openEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={t('list.delete')}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleting(r)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && roles.every((r) => r.builtIn) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">{t('list.empty')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Create / edit */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <form onSubmit={handleSave} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{editing ? t('form.editTitle', { label: editing.label }) : t('form.createTitle')}</DialogTitle>
                <DialogDescription>{t('form.description')}</DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor="role-label">{t('form.label')}</Label>
                <Input
                  id="role-label"
                  value={form.label}
                  maxLength={80}
                  required
                  onChange={(e) => {
                    const label = e.target.value;
                    // Suggest a name from the label until the name is edited by hand
                    setForm((f) => ({
                      ...f,
                      label,
                      ...(!editing && (f.name === '' || f.name === normalizeName(f.label)) && { name: normalizeName(label) }),
                    }));
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role-name">{t('form.name')}</Label>
                <Input
                  id="role-name"
                  value={form.name}
                  maxLength={50}
                  required
                  disabled={!!editing}
                  className="font-mono text-sm"
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {editing
                    ? t('form.nameLocked')
                    : normalized
                      ? t('form.nameHelp', { name: normalized })
                      : t('form.nameHelpEmpty')}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>{t('form.baseRole')}</Label>
                <Select value={form.baseRole} onValueChange={(v: string | null) => v && setForm((f) => ({ ...f, baseRole: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BASE_ROLE_NAMES.map((name) => (
                      <SelectItem key={name} value={name}>{baseLabel(name)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {editing ? t('form.baseRoleEditHelp') : t('form.baseRoleHelp')}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role-description">{t('form.descriptionLabel')}</Label>
                <Textarea
                  id="role-description"
                  value={form.description}
                  maxLength={500}
                  rows={2}
                  placeholder={t('form.descriptionPlaceholder')}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{tc('cancel')}</Button>
                <Button type="submit" disabled={saving || !form.label.trim() || (!editing && !normalized)}>
                  {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  {editing ? t('form.save') : t('form.create')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete */}
        <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('deleteDialog.title', { label: deleting?.label ?? '' })}</AlertDialogTitle>
              <AlertDialogDescription>
                {deleting && deleting.userCount > 0
                  ? t('deleteDialog.inUse', { count: deleting.userCount })
                  : t('deleteDialog.description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDelete}>
                {tc('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminGuard>
  );
}
