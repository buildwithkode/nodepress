'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft,
  RotateCcw,
  Loader2,
  Shield,
  Lock,
  Eye,
  Edit3,
  Layers,
  Save,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import AdminGuard from '@/components/AdminGuard';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

interface SchemaField {
  name: string;
  label?: string;
  type: string;
  required?: boolean;
  readRoles?: string[];
  writeRoles?: string[];
  options?: any;
}

interface ContentTypeDetail {
  id: number;
  name: string;
  displayName?: string;
  schema: SchemaField[];
}

interface ContentTypeSummary {
  id: number;
  name: string;
  displayName?: string;
}

interface PermRow {
  role: string;
  contentType: string;
  actions: string[];
}

type MatrixKey = `${Role}::${string}`;

export default function PermissionsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'content-types' | 'fields'>('content-types');

  // Content type permissions matrix state
  const [contentTypes, setContentTypes] = useState<ContentTypeSummary[]>([]);
  const [perms, setPerms]               = useState<PermRow[]>([]);
  const [saving, setSaving]             = useState<MatrixKey | null>(null);
  const [resetting, setResetting]       = useState(false);
  const [loading, setLoading]           = useState(true);
  const [focusedRole, setFocusedRole]   = useState<Role | null>(null);
  const [rolePerms, setRolePerms]       = useState<PermRow[] | null>(null);
  const [roleLoading, setRoleLoading]   = useState(false);

  // Field-level permissions matrix state
  const [selectedContentTypeName, setSelectedContentTypeName] = useState<string>('');
  const [selectedContentType, setSelectedContentType] = useState<ContentTypeDetail | null>(null);
  const [fieldsState, setFieldsState] = useState<SchemaField[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [savingFields, setSavingFields] = useState(false);
  const [hasFieldChanges, setHasFieldChanges] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [ctRes, permRes] = await Promise.all([
        api.get('/content-types'),
        api.get('/permissions'),
      ]);
      const list = ctRes.data ?? [];
      setContentTypes(list);
      setPerms(permRes.data ?? []);

      if (list.length > 0 && !selectedContentTypeName) {
        setSelectedContentTypeName(list[0].name);
      }
    } catch {
      toast.error('Failed to load permissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Load selected content type schema for field permissions
  useEffect(() => {
    if (!selectedContentTypeName || contentTypes.length === 0) return;
    const ctSummary = contentTypes.find((c) => c.name === selectedContentTypeName);
    if (!ctSummary) return;

    setLoadingSchema(true);
    api.get(`/content-types/${ctSummary.id}`)
      .then((res) => {
        const ct = res.data;
        setSelectedContentType(ct);
        const schema = Array.isArray(ct.schema) ? ct.schema : [];
        setFieldsState(JSON.parse(JSON.stringify(schema)));
        setHasFieldChanges(false);
      })
      .catch(() => toast.error(`Failed to load schema for "${selectedContentTypeName}"`))
      .finally(() => setLoadingSchema(false));
  }, [selectedContentTypeName, contentTypes]);

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

  // ── Field-level permissions toggles ─────────────────────────────────────────

  const toggleFieldReadRole = (fieldIndex: number, role: string) => {
    const updated = [...fieldsState];
    const field = updated[fieldIndex];
    // If readRoles is empty/undefined, all roles currently have read access
    let currentRoles: string[] = field.readRoles && field.readRoles.length > 0
      ? [...field.readRoles]
      : ['admin', 'editor', 'contributor', 'viewer'];

    if (currentRoles.includes(role)) {
      currentRoles = currentRoles.filter((r) => r !== role);
    } else {
      currentRoles = [...currentRoles, role];
    }

    // Admin always has read access
    if (!currentRoles.includes('admin')) {
      currentRoles = ['admin', ...currentRoles];
    }

    // If all roles are enabled, set to undefined/empty (universal access)
    if (['admin', 'editor', 'contributor', 'viewer'].every((r) => currentRoles.includes(r))) {
      field.readRoles = undefined;
    } else {
      field.readRoles = currentRoles;
    }

    setFieldsState(updated);
    setHasFieldChanges(true);
  };

  const toggleFieldWriteRole = (fieldIndex: number, role: string) => {
    const updated = [...fieldsState];
    const field = updated[fieldIndex];
    // If writeRoles is empty/undefined, admin, editors and contributors have write access
    let currentRoles: string[] = field.writeRoles && field.writeRoles.length > 0
      ? [...field.writeRoles]
      : ['admin', 'editor', 'contributor'];

    if (currentRoles.includes(role)) {
      currentRoles = currentRoles.filter((r) => r !== role);
    } else {
      currentRoles = [...currentRoles, role];
    }

    // Admin always has write access
    if (!currentRoles.includes('admin')) {
      currentRoles = ['admin', ...currentRoles];
    }

    // If all write roles are enabled, set to undefined (universal write access)
    if (['admin', 'editor', 'contributor'].every((r) => currentRoles.includes(r))) {
      field.writeRoles = undefined;
    } else {
      field.writeRoles = currentRoles;
    }

    setFieldsState(updated);
    setHasFieldChanges(true);
  };

  const handleSaveFieldPermissions = async () => {
    if (!selectedContentType) return;
    setSavingFields(true);
    try {
      await api.put(`/content-types/${selectedContentType.id}`, {
        schema: fieldsState,
      });
      toast.success(`Field permissions saved for "${selectedContentType.name}"`);
      setHasFieldChanges(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save field permissions');
    } finally {
      setSavingFields(false);
    }
  };

  const rows = ['*', ...contentTypes.map((ct) => ct.name)];

  return (
    <AdminGuard>
      <div className="space-y-6 w-full">
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
          <span className="text-sm font-medium">Access Control & Permissions</span>
          <div className="ml-auto">
            {activeTab === 'content-types' && (
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
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="bg-muted/50 p-1 mb-2">
            <TabsTrigger value="content-types" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>Content-Type Actions Matrix</span>
            </TabsTrigger>
            <TabsTrigger value="fields" className="flex items-center gap-2">
              <Sliders className="h-4 w-4" />
              <span>Field-Level Permissions Matrix</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Content Type Actions Matrix ──────────────────────────── */}
          <TabsContent value="content-types" className="space-y-6 pt-2">
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

            {/* Focused role detail */}
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
                <CardTitle>Content Type Permission Matrix</CardTitle>
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
          </TabsContent>

          {/* ── Tab 2: Granular Field-Level Permissions Matrix ──────────────── */}
          <TabsContent value="fields" className="space-y-6 pt-2">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="h-5 w-5 text-blue-500" />
                      Field-Level Access Control Matrix
                    </CardTitle>
                    <CardDescription>
                      Restrict read visibility and write mutations for specific attributes (e.g., hide salary, margin, or internal notes from non-admin roles).
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-48">
                      <Select
                        value={selectedContentTypeName}
                        onValueChange={(val) => val && setSelectedContentTypeName(val)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select content type" />
                        </SelectTrigger>
                        <SelectContent>
                          {contentTypes.map((ct) => (
                            <SelectItem key={ct.id} value={ct.name} className="text-xs capitalize">
                              {ct.displayName || ct.name.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      size="sm"
                      onClick={handleSaveFieldPermissions}
                      disabled={!hasFieldChanges || savingFields}
                      className="gap-1.5"
                    >
                      {savingFields ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save Permissions
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingSchema ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading fields schema…
                  </div>
                ) : fieldsState.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                    <p className="text-sm font-medium">No fields defined for this content type</p>
                    <p className="text-xs mt-1">Add fields to this content type in the Schema Builder first.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-48">Field</th>
                          <th colSpan={4} className="text-center py-2 px-2 font-medium bg-muted/20 border-r border-border">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                              <Eye className="h-3.5 w-3.5 text-blue-400" /> Read Visibility
                            </span>
                          </th>
                          <th colSpan={3} className="text-center py-2 px-2 font-medium bg-muted/10">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                              <Edit3 className="h-3.5 w-3.5 text-amber-400" /> Write / Mutation Access
                            </span>
                          </th>
                        </tr>
                        <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                          <th className="py-1.5 pr-4 text-left font-normal">Name & Type</th>
                          {/* Read subheaders */}
                          <th className="py-1.5 px-2 text-center font-normal">Admin</th>
                          <th className="py-1.5 px-2 text-center font-normal">Editor</th>
                          <th className="py-1.5 px-2 text-center font-normal">Contributor</th>
                          <th className="py-1.5 px-2 text-center font-normal border-r border-border">Viewer</th>
                          {/* Write subheaders */}
                          <th className="py-1.5 px-2 text-center font-normal">Admin</th>
                          <th className="py-1.5 px-2 text-center font-normal">Editor</th>
                          <th className="py-1.5 px-2 text-center font-normal">Contributor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fieldsState.map((field, idx) => {
                          const readRoles = field.readRoles ?? ['admin', 'editor', 'contributor', 'viewer'];
                          const writeRoles = field.writeRoles ?? ['admin', 'editor', 'contributor'];
                          const isRestrictedRead = !!field.readRoles && !['editor', 'contributor', 'viewer'].every((r) => field.readRoles!.includes(r));
                          const isRestrictedWrite = !!field.writeRoles && !['editor', 'contributor'].every((r) => field.writeRoles!.includes(r));

                          return (
                            <tr key={field.name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              {/* Field Info */}
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-xs text-foreground font-mono">{field.name}</span>
                                  <Badge variant="outline" className="text-[10px] font-mono capitalize">
                                    {field.type}
                                  </Badge>
                                  {(isRestrictedRead || isRestrictedWrite) && (
                                    <Badge variant="secondary" className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 gap-0.5 px-1 py-0">
                                      <Lock className="h-2.5 w-2.5" /> Restricted
                                    </Badge>
                                  )}
                                </div>
                              </td>

                              {/* Read: Admin (Locked) */}
                              <td className="py-3 px-2 text-center">
                                <span className="inline-flex items-center justify-center text-xs text-emerald-400" title="Admin always has full read access">
                                  <Lock className="h-3.5 w-3.5 opacity-50" />
                                </span>
                              </td>

                              {/* Read: Editor */}
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={readRoles.includes('editor')}
                                  onChange={() => toggleFieldReadRole(idx, 'editor')}
                                  className="h-4 w-4 rounded cursor-pointer accent-primary"
                                />
                              </td>

                              {/* Read: Contributor */}
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={readRoles.includes('contributor')}
                                  onChange={() => toggleFieldReadRole(idx, 'contributor')}
                                  className="h-4 w-4 rounded cursor-pointer accent-primary"
                                />
                              </td>

                              {/* Read: Viewer */}
                              <td className="py-3 px-2 text-center border-r border-border">
                                <input
                                  type="checkbox"
                                  checked={readRoles.includes('viewer')}
                                  onChange={() => toggleFieldReadRole(idx, 'viewer')}
                                  className="h-4 w-4 rounded cursor-pointer accent-primary"
                                />
                              </td>

                              {/* Write: Admin (Locked) */}
                              <td className="py-3 px-2 text-center">
                                <span className="inline-flex items-center justify-center text-xs text-emerald-400" title="Admin always has full write access">
                                  <Lock className="h-3.5 w-3.5 opacity-50" />
                                </span>
                              </td>

                              {/* Write: Editor */}
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={writeRoles.includes('editor')}
                                  onChange={() => toggleFieldWriteRole(idx, 'editor')}
                                  className="h-4 w-4 rounded cursor-pointer accent-primary"
                                />
                              </td>

                              {/* Write: Contributor */}
                              <td className="py-3 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={writeRoles.includes('contributor')}
                                  onChange={() => toggleFieldWriteRole(idx, 'contributor')}
                                  className="h-4 w-4 rounded cursor-pointer accent-primary"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="p-4 rounded-lg bg-card/60 border border-border text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Zero-Leak Security Enforcement:
              </p>
              <p>• When a role is unchecked from <strong>Read Visibility</strong>, the backend automatically strips the field from all REST (<code className="text-[11px] font-mono">/api/:type/:slug</code>) and GraphQL responses before sending to the client.</p>
              <p>• When a role is unchecked from <strong>Write Access</strong>, the backend rejects unauthorized mutation attempts with HTTP 403 Forbidden.</p>
            </div>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">
          Note: Admin always has universal access across all schema fields and cannot be restricted.
        </p>
      </div>
    </AdminGuard>
  );
}
