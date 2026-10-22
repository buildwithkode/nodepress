'use client';

import { useEffect, useState, Suspense } from 'react';
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
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import AdminGuard from '@/components/AdminGuard';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { roleBadgeColor, roleLabel, useRoleList } from '@/lib/custom-roles';

/** Built-in roles with permission rows; custom roles are appended at runtime. */
const BUILT_IN_ROLES = ['editor', 'contributor', 'viewer'] as const;
type BuiltInRole = typeof BUILT_IN_ROLES[number];
type Role = string;
const isBuiltIn = (role: string): role is BuiltInRole => (BUILT_IN_ROLES as readonly string[]).includes(role);

const ALL_ACTIONS = ['create', 'read', 'update', 'delete', 'publish'] as const;
type Action = typeof ALL_ACTIONS[number];

/** Message keys (users.permissions.actions.*) — translated at render. */
const ACTION_LABELS: Record<Action, string> = {
  create:  'actions.create',
  read:    'actions.read',
  update:  'actions.update',
  delete:  'actions.delete',
  publish: 'actions.publish',
};

/** Message keys (users.permissions.roleDescriptions.*) — translated at render. */
const ROLE_DESCRIPTIONS: Record<BuiltInRole, string> = {
  editor:      'roleDescriptions.editor',
  contributor: 'roleDescriptions.contributor',
  viewer:      'roleDescriptions.viewer',
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

function PermissionsPageContent() {
  const t = useTranslations('users.permissions');
  const tc = useTranslations('common');
  const tr = useTranslations('roles');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { roles, customRoles } = useRoleList();
  const ROLES: Role[] = [...BUILT_IN_ROLES, ...customRoles.map((r) => r.name)];
  const labelOf = (role: string) => roleLabel(role, roles, tc);
  const baseOf = (role: string) => customRoles.find((r) => r.name === role)?.baseRole ?? 'viewer';
  const describe = (role: string) => {
    if (isBuiltIn(role)) return t(ROLE_DESCRIPTIONS[role]);
    const custom = customRoles.find((r) => r.name === role);
    return custom?.description || tr('basedOn', { base: labelOf(baseOf(role)) });
  };
  const initialCt = searchParams.get('ct') ?? '';
  const initialTab = searchParams.get('tab') ?? '';

  const [activeTab, setActiveTab] = useState<'content-types' | 'fields'>(
    initialTab === 'fields' || initialCt ? 'fields' : 'content-types'
  );

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
  const [selectedContentTypeName, setSelectedContentTypeName] = useState<string>(initialCt);
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

      if (list.length > 0) {
        if (initialCt && list.some((c: any) => c.name === initialCt)) {
          setSelectedContentTypeName(initialCt);
        } else if (!selectedContentTypeName) {
          setSelectedContentTypeName(list[0].name);
        }
      }
    } catch {
      toast.error(t('toasts.loadFailed'));
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
      .catch(() => toast.error(t('toasts.schemaLoadFailed', { name: selectedContentTypeName })))
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
      toast.error(t('toasts.roleLoadFailed'));
    } finally {
      setRoleLoading(false);
    }
  };

  const getActions = (role: Role, contentType: string): string[] => {
    const specific = perms.find((p) => p.role === role && p.contentType === contentType);
    const wildcard = perms.find((p) => p.role === role && p.contentType === '*');
    const own = specific ?? wildcard;
    // A custom role with no row of its own uses its base role's (as the backend does)
    if (!own && !isBuiltIn(role)) return getActions(baseOf(role), contentType);
    return own?.actions ?? [];
  };

  const isInherited = (role: Role, contentType: string): boolean => {
    if (contentType === '*') return !isBuiltIn(role) && !perms.some((p) => p.role === role && p.contentType === '*');
    return !perms.some((p) => p.role === role && p.contentType === contentType);
  };

  /** Whose rows an inherited cell shows: the role's own wildcard, or a custom role's base role. */
  const inheritsFrom = (role: Role): string =>
    !isBuiltIn(role) && !perms.some((p) => p.role === role && p.contentType === '*') ? baseOf(role) : role;

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
      toast.success(t('toasts.updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.updateFailed'));
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await api.put('/permissions/reset/all');
      await load();
      toast.success(t('toasts.reset'));
    } catch {
      toast.error(t('toasts.resetFailed'));
    } finally {
      setResetting(false);
    }
  };

  // ── Field-level permissions toggles ─────────────────────────────────────────

  // A field rule lists role names. A custom role passes when the rule lists it
  // or its base role, so a custom column shows inherited access as checked.
  const FIELD_DEFAULTS = {
    readRoles: ['admin', 'editor', 'contributor', 'viewer'],
    writeRoles: ['admin', 'editor', 'contributor'],
  } as const;
  const readColumns: string[] = [...BUILT_IN_ROLES, ...customRoles.map((r) => r.name)];
  // Viewer-based roles can't write entries at all, so they get no write column.
  const writeColumns: string[] = ['editor', 'contributor', ...customRoles.filter((r) => r.baseRole !== 'viewer').map((r) => r.name)];
  const fieldInherited = (list: readonly string[], role: string) =>
    !isBuiltIn(role) && list.includes(baseOf(role));

  const toggleFieldRole = (fieldIndex: number, kind: 'readRoles' | 'writeRoles', role: string) => {
    const updated = [...fieldsState];
    const field = updated[fieldIndex];
    const defaults: readonly string[] = FIELD_DEFAULTS[kind];
    // No rule = the defaults have access
    let currentRoles: string[] = field[kind] && field[kind]!.length > 0 ? [...field[kind]!] : [...defaults];

    if (currentRoles.includes(role)) {
      currentRoles = currentRoles.filter((r) => r !== role);
    } else {
      currentRoles = [...currentRoles, role];
    }

    // Admin always has access
    if (!currentRoles.includes('admin')) {
      currentRoles = ['admin', ...currentRoles];
    }

    // Every default role enabled = no restriction (custom roles are then covered too)
    field[kind] = defaults.every((r) => currentRoles.includes(r)) ? undefined : currentRoles;

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
      toast.success(t('toasts.fieldsSaved', { name: selectedContentType.name }));
      setHasFieldChanges(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.fieldsSaveFailed'));
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
            <ArrowLeft className="h-4 w-4" /> {t('backToUsers')}
          </Button>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium">{t('title')}</span>
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
                {t('resetDefaults')}
              </Button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="bg-muted/50 p-1 mb-2">
            <TabsTrigger value="content-types" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>{t('tabs.contentTypes')}</span>
            </TabsTrigger>
            <TabsTrigger value="fields" className="flex items-center gap-2">
              <Sliders className="h-4 w-4" />
              <span>{t('tabs.fields')}</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Content Type Actions Matrix ──────────────────────────── */}
          <TabsContent value="content-types" className="space-y-6 pt-2">
            {/* Role overview — click to focus */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {ROLES.map((r) => (
                <Card
                  key={r}
                  className={`text-sm cursor-pointer transition-all hover:border-primary/50 ${focusedRole === r ? 'ring-2 ring-primary border-primary' : ''}`}
                  onClick={() => focusRole(r)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(r)}`}>
                        {labelOf(r)}
                      </span>
                      {focusedRole === r && (
                        <span className="text-[10px] text-muted-foreground">{t('clickToDeselect')}</span>
                      )}
                    </div>
                    <CardDescription className="text-xs mt-1">{describe(r)}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>

            {/* Focused role detail */}
            {focusedRole && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(focusedRole)}`}>
                      {labelOf(focusedRole)}
                    </span>
                    — {t('summary.title')}
                  </CardTitle>
                  <CardDescription>{t('summary.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                  {roleLoading ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> {tc('loading')}
                    </div>
                  ) : !rolePerms || rolePerms.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">{t('summary.empty')}</p>
                  ) : (
                    <div className="space-y-2">
                      {rolePerms.map((p) => (
                        <div key={p.contentType} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                          <span className="w-28 font-medium text-foreground capitalize shrink-0">
                            {p.contentType === '*' ? <Badge variant="secondary" className="text-xs">{t('defaultRow')}</Badge> : p.contentType.replace(/_/g, ' ')}
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
                                {t(ACTION_LABELS[a])}
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
                <CardTitle>{t('matrix.title')}</CardTitle>
                <CardDescription>
                  {t.rich('matrix.description', { strong: (chunks) => <strong>{chunks}</strong> })}
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
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-36">{t('matrix.contentType')}</th>
                          {ROLES.map((r) => (
                            <th key={r} colSpan={ALL_ACTIONS.length} className="text-center py-2 px-2 font-medium">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(r)}`}>
                                {labelOf(r)}
                              </span>
                            </th>
                          ))}
                        </tr>
                        <tr className="border-b bg-muted/30">
                          <th className="py-1.5 pr-4" />
                          {ROLES.flatMap((r) =>
                            ALL_ACTIONS.map((a) => (
                              <th key={`${r}-${a}`} className="py-1.5 px-1.5 text-center text-xs font-normal text-muted-foreground min-w-[52px]">
                                {t(ACTION_LABELS[a])}
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
                                    <Badge variant="secondary" className="text-xs">{t('defaultRow')}</Badge>
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
                                          title={inherited ? t('matrix.inherited', { role: inheritsFrom(role) }) : undefined}
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
                      {t('fields.title')}
                    </CardTitle>
                    <CardDescription>
                      {t('fields.description')}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-48">
                      <Select
                        value={selectedContentTypeName}
                        onValueChange={(val) => val && setSelectedContentTypeName(val)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={t('fields.selectContentType')} />
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
                      {t('fields.save')}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingSchema ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t('fields.loading')}
                  </div>
                ) : fieldsState.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
                    <p className="text-sm font-medium">{t('fields.emptyTitle')}</p>
                    <p className="text-xs mt-1">{t('fields.emptyHelp')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-48">{t('fields.field')}</th>
                          <th colSpan={readColumns.length + 1} className="text-center py-2 px-2 font-medium bg-muted/20 border-r border-border">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                              <Eye className="h-3.5 w-3.5 text-blue-400" /> {t('fields.readVisibility')}
                            </span>
                          </th>
                          <th colSpan={writeColumns.length + 1} className="text-center py-2 px-2 font-medium bg-muted/10">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                              <Edit3 className="h-3.5 w-3.5 text-amber-400" /> {t('fields.writeAccess')}
                            </span>
                          </th>
                        </tr>
                        <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                          <th className="py-1.5 pr-4 text-left font-normal">{t('fields.nameAndType')}</th>
                          {/* Read subheaders */}
                          <th className="py-1.5 px-2 text-center font-normal">{tc('roles.admin')}</th>
                          {readColumns.map((role, i) => (
                            <th
                              key={role}
                              className={`py-1.5 px-2 text-center font-normal${i === readColumns.length - 1 ? ' border-r border-border' : ''}`}
                            >
                              {labelOf(role)}
                            </th>
                          ))}
                          {/* Write subheaders */}
                          <th className="py-1.5 px-2 text-center font-normal">{tc('roles.admin')}</th>
                          {writeColumns.map((role) => (
                            <th key={role} className="py-1.5 px-2 text-center font-normal">{labelOf(role)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fieldsState.map((field, idx) => {
                          const readRoles: readonly string[] = field.readRoles ?? FIELD_DEFAULTS.readRoles;
                          const writeRoles: readonly string[] = field.writeRoles ?? FIELD_DEFAULTS.writeRoles;
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
                                      <Lock className="h-2.5 w-2.5" /> {t('fields.restricted')}
                                    </Badge>
                                  )}
                                </div>
                              </td>

                              {/* Read: Admin (Locked) */}
                              <td className="py-3 px-2 text-center">
                                <span className="inline-flex items-center justify-center text-xs text-emerald-400" title={t('fields.adminRead')}>
                                  <Lock className="h-3.5 w-3.5 opacity-50" />
                                </span>
                              </td>

                              {readColumns.map((role, i) => {
                                const inherited = fieldInherited(readRoles, role);
                                return (
                                  <td
                                    key={role}
                                    className={`py-3 px-2 text-center${i === readColumns.length - 1 ? ' border-r border-border' : ''}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={inherited || readRoles.includes(role)}
                                      disabled={inherited}
                                      title={inherited ? t('fields.inherited', { base: labelOf(baseOf(role)) }) : undefined}
                                      onChange={() => toggleFieldRole(idx, 'readRoles', role)}
                                      className="h-4 w-4 rounded cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                  </td>
                                );
                              })}

                              {/* Write: Admin (Locked) */}
                              <td className="py-3 px-2 text-center">
                                <span className="inline-flex items-center justify-center text-xs text-emerald-400" title={t('fields.adminWrite')}>
                                  <Lock className="h-3.5 w-3.5 opacity-50" />
                                </span>
                              </td>

                              {writeColumns.map((role) => {
                                const inherited = fieldInherited(writeRoles, role);
                                return (
                                  <td key={role} className="py-3 px-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={inherited || writeRoles.includes(role)}
                                      disabled={inherited}
                                      title={inherited ? t('fields.inherited', { base: labelOf(baseOf(role)) }) : undefined}
                                      onChange={() => toggleFieldRole(idx, 'writeRoles', role)}
                                      className="h-4 w-4 rounded cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                  </td>
                                );
                              })}
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
                {t('enforcement.title')}
              </p>
              <p>• {t.rich('enforcement.read', {
                strong: (chunks) => <strong>{chunks}</strong>,
                path: () => <code className="text-[11px] font-mono">/api/:type/:slug</code>,
              })}</p>
              <p>• {t.rich('enforcement.write', { strong: (chunks) => <strong>{chunks}</strong> })}</p>
            </div>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">
          {t('adminNote')}
        </p>
      </div>
    </AdminGuard>
  );
}

function PermissionsFallback() {
  const t = useTranslations('users.permissions');
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin mr-2" /> {t('loading')}
    </div>
  );
}

export default function PermissionsPage() {
  return (
    <Suspense
      fallback={<PermissionsFallback />}
    >
      <PermissionsPageContent />
    </Suspense>
  );
}
