'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, RotateCcw, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AdminGuard from '@/components/AdminGuard';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const ROLES = ['editor', 'contributor', 'viewer'] as const;
type Role = typeof ROLES[number];

const ALL_ACTIONS = ['create', 'read', 'update', 'delete', 'publish'] as const;
type Action = typeof ALL_ACTIONS[number];

const ACTION_LABELS: Record<Action, string> = {
  create:  'Create',
  read:    'Read',
  update:  'Update',
  delete:  'Delete',
  publish: 'Publish',
};

const ROLE_COLORS: Record<Role, string> = {
  editor:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  contributor: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  viewer:      'bg-muted text-muted-foreground',
};

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  editor:      'Manages all content — can create, edit, delete, and publish.',
  contributor: 'Creates and edits content — cannot delete or publish.',
  viewer:      'Read-only access to the admin panel.',
};

interface ContentType { id: number; name: string }
interface PermRow { role: string; contentType: string; actions: string[] }

// Wildcard row always shown; content-type rows appear when overrides exist
type MatrixKey = `${Role}::${string}`;

export default function PermissionsPage() {
  const router = useRouter();
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [perms, setPerms]               = useState<PermRow[]>([]);
  const [saving, setSaving]             = useState<MatrixKey | null>(null);
  const [resetting, setResetting]       = useState(false);
  const [loading, setLoading]           = useState(true);
  const [focusedRole, setFocusedRole]   = useState<Role | null>(null);
  const [rolePerms, setRolePerms]       = useState<PermRow[] | null>(null);
  const [roleLoading, setRoleLoading]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ctRes, permRes] = await Promise.all([
        api.get('/content-types'),
        api.get('/permissions'),
      ]);
      setContentTypes(ctRes.data ?? []);
      setPerms(permRes.data ?? []);
    } catch {
      toast.error('Failed to load permissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const focusRole = async (role: Role) => {
    if (focusedRole === role) { setFocusedRole(null); setRolePerms(null); return; }
    setFocusedRole(role);
    setRoleLoading(true);
    try {
      const res = await api.get(`/permissions/${role}`);
      setRolePerms(res.data ?? []);
    } catch {
      toast.error('Failed to load role permissions');
    } finally {
      setRoleLoading(false);
    }
  };

  const getActions = (role: Role, contentType: string): string[] => {
    const specific = perms.find((p) => p.role === role && p.contentType === contentType);
    const wildcard = perms.find((p) => p.role === role && p.contentType === '*');
    return (specific ?? wildcard)?.actions ?? [];
  };

  const isInherited = (role: Role, contentType: string): boolean => {
    if (contentType === '*') return false;
    return !perms.some((p) => p.role === role && p.contentType === contentType);
  };

  const toggleAction = async (role: Role, contentType: string, action: Action) => {
    const current = getActions(role, contentType);
    const next = current.includes(action)
      ? current.filter((a) => a !== action)
      : [...current, action];

    const key: MatrixKey = `${role}::${contentType}`;
    setSaving(key);
    try {
      await api.put(`/permissions/${role}/${contentType}`, { actions: next });
      await load();
      toast.success('Permission updated');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update permission');
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await api.put('/permissions/reset/all');
      await load();
      toast.success('Permissions reset to defaults');
    } catch {
      toast.error('Failed to reset permissions');
    } finally {
      setResetting(false);
    }
  };

  // Rows: wildcard '*' first, then each content type
  const rows = ['*', ...contentTypes.map((ct) => ct.name)];

  return (
    <AdminGuard>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => router.push('/users')}
          >
            <ArrowLeft className="h-4 w-4" /> Users
          </Button>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium">Permissions</span>
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              disabled={resetting}
              onClick={handleReset}
            >
              {resetting
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />}
              Reset to defaults
            </Button>
          </div>
        </div>

        {/* Role overview — click to focus */}
        <div className="grid grid-cols-3 gap-3">
          {ROLES.map((r) => (
            <Card
              key={r}
              className={`text-sm cursor-pointer transition-all hover:border-primary/50 ${focusedRole === r ? 'ring-2 ring-primary border-primary' : ''}`}
              onClick={() => focusRole(r)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[r]}`}>
                    {r}
                  </span>
                  {focusedRole === r && (
                    <span className="text-[10px] text-muted-foreground">click to deselect</span>
                  )}
                </div>
                <CardDescription className="text-xs mt-1">{ROLE_DESCRIPTIONS[r]}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Focused role detail — shown when a role card is clicked */}
        {focusedRole && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[focusedRole]}`}>
                  {focusedRole}
                </span>
                — Permission Summary
              </CardTitle>
              <CardDescription>Overrides configured for this role. Rows not listed here fall back to the wildcard default.</CardDescription>
            </CardHeader>
            <CardContent>
              {roleLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : !rolePerms || rolePerms.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No overrides — using factory defaults for all content types.</p>
              ) : (
                <div className="space-y-2">
                  {rolePerms.map((p) => (
                    <div key={p.contentType} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                      <span className="w-28 font-medium text-foreground capitalize shrink-0">
                        {p.contentType === '*' ? <Badge variant="secondary" className="text-xs">Default *</Badge> : p.contentType.replace(/_/g, ' ')}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {ALL_ACTIONS.map((a) => (
                          <span
                            key={a}
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              p.actions.includes(a)
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                : 'bg-muted text-muted-foreground line-through opacity-50'
                            }`}
                          >
                            {ACTION_LABELS[a]}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Permission matrix */}
        <Card>
          <CardHeader>
            <CardTitle>Permission Matrix</CardTitle>
            <CardDescription>
              Set allowed actions per role. The <strong>*</strong> row is the default for all content types.
              Override individual content types by toggling actions in their specific row.
              Greyed checkboxes are inherited from the wildcard row.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-36">Content Type</th>
                      {ROLES.map((r) => (
                        <th key={r} colSpan={ALL_ACTIONS.length} className="text-center py-2 px-2 font-medium">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[r]}`}>
                            {r}
                          </span>
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b bg-muted/30">
                      <th className="py-1.5 pr-4" />
                      {ROLES.flatMap((r) =>
                        ALL_ACTIONS.map((a) => (
                          <th key={`${r}-${a}`} className="py-1.5 px-1.5 text-center text-xs font-normal text-muted-foreground min-w-[52px]">
                            {ACTION_LABELS[a]}
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((ct) => {
                      const isWildcard = ct === '*';
                      return (
                        <tr key={ct} className={`border-b last:border-0 ${isWildcard ? 'bg-muted/20 font-medium' : ''}`}>
                          <td className="py-2 pr-4">
                            {isWildcard ? (
                              <span className="flex items-center gap-1.5">
                                <Badge variant="secondary" className="text-xs">Default *</Badge>
                              </span>
                            ) : (
                              <span className="text-xs capitalize">{ct.replace(/_/g, ' ')}</span>
                            )}
                          </td>
                          {ROLES.flatMap((role) =>
                            ALL_ACTIONS.map((action) => {
                              const key: MatrixKey = `${role}::${ct}`;
                              const actions = getActions(role, ct);
                              const checked = actions.includes(action);
                              const inherited = isInherited(role, ct);
                              const isSaving = saving === key;

                              return (
                                <td key={`${role}-${ct}-${action}`} className="py-2 px-1.5 text-center">
                                  {isSaving ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto text-muted-foreground" />
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleAction(role, ct, action)}
                                      className={`h-4 w-4 rounded cursor-pointer accent-primary ${inherited ? 'opacity-40' : ''}`}
                                      title={inherited ? `Inherited from ${role}/* — click to override` : undefined}
                                    />
                                  )}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Note: Admin always has full access to everything and cannot be restricted here.
          Changes take effect immediately on next request.
        </p>
      </div>
    </AdminGuard>
  );
}
