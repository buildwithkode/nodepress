'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Loader2, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { roleBadgeColor, roleLabel, type RoleInfo } from '@/lib/custom-roles';
import type { AccessLevel } from '@/lib/access';

/**
 * Users → Permissions → Module access: per role, none / view / edit for each
 * admin module (GET/PUT /roles/access). Content is the role's content
 * permission rows (/permissions) — a default for every type, overridable per
 * type, plus "Can publish" and "Can delete".
 */

interface ModuleDef { key: string; label: string; description: string; plugin?: string }
interface RoleAccess { name: string; access: { modules: Record<string, AccessLevel>; content: Record<string, string[]> } }
interface PermRow { role: string; contentType: string; actions: string[] }
interface ContentTypeSummary { id: number; name: string; displayName?: string }

const LEVELS: AccessLevel[] = ['none', 'view', 'edit'];

/** Sidebar order; plugin modules go last in their own group. */
const GROUPS: Array<[string, string[]]> = [
  ['content', ['content', 'media', 'forms', 'releases', 'redirects']],
  ['structure', ['content_model', 'languages']],
  ['team', ['users', 'api_keys', 'webhooks', 'jobs', 'audit_log', 'plugins']],
  ['settings', ['import', 'brand', 'server_settings']],
];

/** Edit on these is close to admin — say so next to them. */
const POWERFUL = new Set(['users', 'api_keys', 'plugins', 'server_settings']);

function contentLevel(actions: string[]): AccessLevel {
  if (actions.includes('create') || actions.includes('update')) return 'edit';
  return actions.includes('read') ? 'view' : 'none';
}

function contentActions(level: AccessLevel, publish: boolean, del: boolean): string[] {
  if (level === 'none') return [];
  if (level === 'view') return ['read'];
  return ['create', 'read', 'update', ...(del ? ['delete'] : []), ...(publish ? ['publish'] : [])];
}

function LevelPicker({ value, onChange, disabled, label }: {
  value: AccessLevel; onChange: (v: AccessLevel) => void; disabled?: boolean; label: string;
}) {
  const t = useTranslations('users.permissions');
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-md border border-border p-0.5 bg-muted/30">
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={value === level}
          disabled={disabled}
          onClick={() => value !== level && onChange(level)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-[5px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            value === level
              ? level === 'none'
                ? 'bg-background text-foreground shadow-xs'
                : 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t(`modules.levels.${level}`)}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, disabled, children }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <label className={cn('inline-flex items-center gap-1.5 text-xs', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <input
        type="checkbox"
        className="h-3.5 w-3.5 rounded accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}

export function ModuleAccessEditor({ roles, reloadKey }: { roles: RoleInfo[]; reloadKey: number }) {
  const t = useTranslations('users.permissions');
  const tc = useTranslations('common');
  const tr = useTranslations('roles');

  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [matrix, setMatrix] = useState<RoleAccess[]>([]);
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentTypeSummary[]>([]);
  const [role, setRole] = useState<string>('editor');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showTypes, setShowTypes] = useState(false);

  const load = useCallback(async () => {
    try {
      const [accessRes, permRes, ctRes] = await Promise.all([
        api.get('/roles/access'),
        api.get('/permissions'),
        api.get('/content-types'),
      ]);
      setModules(accessRes.data?.modules ?? []);
      setMatrix(accessRes.data?.roles ?? []);
      setPerms(permRes.data ?? []);
      setContentTypes(ctRes.data ?? []);
    } catch {
      toast.error(t('toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const current = matrix.find((r) => r.name === role) ?? matrix[0];
  const roleName = current?.name ?? role;
  const info = roles.find((r) => r.name === roleName);
  const labelOf = (name: string) => roleLabel(name, roles, tc);

  const moduleLabel = (m: ModuleDef) =>
    !m.plugin && t.has(`modules.items.${m.key}.label`) ? t(`modules.items.${m.key}.label`) : m.label;
  const moduleDescription = (m: ModuleDef) =>
    !m.plugin && t.has(`modules.items.${m.key}.description`) ? t(`modules.items.${m.key}.description`) : m.description;

  const save = async (key: string, request: () => Promise<unknown>) => {
    setSaving(key);
    try {
      await request();
      await load();
      toast.success(t('toasts.updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toasts.updateFailed'));
    } finally {
      setSaving(null);
    }
  };

  const setModule = (key: string, level: AccessLevel) =>
    save(key, () => api.put(`/roles/access/${roleName}`, { modules: { [key]: level } }));

  // ── Content ────────────────────────────────────────────────────────────────
  const contentOf = (type: string) => current?.access.content[type] ?? current?.access.content['*'] ?? [];
  const ownRow = (type: string) => perms.find((p) => p.role === roleName && p.contentType === type);
  const setContent = (type: string, level: AccessLevel, publish: boolean, del: boolean) =>
    save(`content:${type}`, () => api.put(`/permissions/${roleName}/${type}`, { actions: contentActions(level, publish, del) }));
  const resetType = (type: string) =>
    save(`content:${type}`, () => api.delete(`/permissions/${roleName}/${type}`));

  const overrides = contentTypes.filter((ct) => !!ownRow(ct.name)).length;

  const contentControls = (type: string, compact = false) => {
    const actions = contentOf(type);
    const level = contentLevel(actions);
    const publish = actions.includes('publish');
    const del = actions.includes('delete');
    const busy = saving === `content:${type}`;
    return (
      <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', compact ? 'justify-end' : 'sm:justify-end')}>
        {level === 'edit' && (
          <>
            <Toggle checked={publish} disabled={busy} onChange={(v) => setContent(type, level, v, del)}>{t('modules.canPublish')}</Toggle>
            <Toggle checked={del} disabled={busy} onChange={(v) => setContent(type, level, publish, v)}>{t('modules.canDelete')}</Toggle>
          </>
        )}
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <LevelPicker
          value={level}
          disabled={busy}
          label={type === '*' ? t('modules.items.content.label') : type}
          onChange={(v) => setContent(type, v, publish, del)}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const byKey = new Map(modules.map((m) => [m.key, m]));
  const grouped = new Set(GROUPS.flatMap(([, keys]) => keys));
  // Core modules GROUPS doesn't list yet go under settings; plugin modules get their own group
  const ungrouped = modules.filter((m) => !m.plugin && !grouped.has(m.key));
  const sections = ([
    ...GROUPS.map(([g, keys]): [string, ModuleDef[]] => [
      g,
      [...keys.flatMap((k) => byKey.get(k) ?? []), ...(g === 'settings' ? ungrouped : [])],
    ]),
    ['plugins', modules.filter((m) => m.plugin)],
  ] as Array<[string, ModuleDef[]]>).filter(([, list]) => list.length > 0);

  return (
    <div className="space-y-4">
      {/* Role picker */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('modules.role')}>
        {matrix.map((r) => (
          <button
            key={r.name}
            type="button"
            role="tab"
            aria-selected={r.name === roleName}
            onClick={() => { setRole(r.name); setShowTypes(false); }}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              r.name === roleName ? cn(roleBadgeColor(r.name), 'border-transparent ring-2 ring-primary/60') : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {labelOf(r.name)}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(roleName)}`}>
              {labelOf(roleName)}
            </span>
            {t('modules.title')}
          </CardTitle>
          <CardDescription>
            {info && !info.builtIn
              ? (info.description || tr('basedOn', { base: labelOf(info.baseRole) }))
              : t.has(`roleDescriptions.${roleName}`) ? t(`roleDescriptions.${roleName}`) : null}
            {' '}{t('modules.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {sections.map(([group, list]) => (
            <section key={group} className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-1">
                {t(`modules.groups.${group}`)}
              </h3>
              <div className="divide-y divide-border rounded-lg border border-border">
                {list.map((m) => {
                  const level = current?.access.modules[m.key] ?? 'none';
                  return (
                    <div key={m.key} className="px-3 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            {moduleLabel(m)}
                            {m.plugin && <Badge variant="outline" className="text-[10px]">{t('modules.fromPlugin', { plugin: m.plugin })}</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{moduleDescription(m)}</p>
                          {POWERFUL.has(m.key) && level === 'edit' && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                              <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> {t('modules.powerful')}
                            </p>
                          )}
                        </div>
                        {m.key === 'content' ? contentControls('*') : (
                          <div className="flex items-center gap-2 sm:justify-end">
                            {saving === m.key && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                            <LevelPicker
                              value={level}
                              disabled={saving === m.key}
                              label={moduleLabel(m)}
                              onChange={(v) => setModule(m.key, v)}
                            />
                          </div>
                        )}
                      </div>

                      {m.key === 'content' && contentTypes.length > 0 && (
                        <div className="mt-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            aria-expanded={showTypes}
                            onClick={() => setShowTypes((v) => !v)}
                          >
                            {showTypes ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {t('modules.perType')}
                            {overrides > 0 && <Badge variant="secondary" className="text-[10px]">{t('modules.overrides', { count: overrides })}</Badge>}
                          </button>
                          {showTypes && (
                            <div className="mt-2 divide-y divide-border rounded-md border border-border bg-muted/20">
                              {contentTypes.map((ct) => {
                                const overridden = !!ownRow(ct.name);
                                return (
                                  <div key={ct.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-2 text-xs">
                                      {/* Content type names are data — shown as stored */}
                                      <span className="font-medium">{ct.displayName || ct.name.replace(/_/g, ' ')}</span>
                                      {overridden ? (
                                        <button
                                          type="button"
                                          className="text-muted-foreground underline hover:text-foreground"
                                          disabled={saving === `content:${ct.name}`}
                                          onClick={() => resetType(ct.name)}
                                        >
                                          {t('modules.useDefault')}
                                        </button>
                                      ) : (
                                        <span className="text-muted-foreground">{t('modules.asDefault')}</span>
                                      )}
                                    </div>
                                    {contentControls(ct.name, true)}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">{t('modules.adminOnlyNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
