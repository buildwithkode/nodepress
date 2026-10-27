'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import api from '@/lib/axios';
import type { AccessLevel } from '@/lib/access';
import { roleBadgeColor } from '@/lib/custom-roles';
import { Skeleton } from '@/components/ui/skeleton';

interface ModuleDef { key: string; label: string; plugin?: string }
interface RoleAccess { name: string; access: { modules: Record<string, AccessLevel>; content: Record<string, string[]> } }

/**
 * What each role can use, read live from GET /roles/access (admin only), so it
 * follows Users → Permissions and lists custom roles too.
 */
export function RoleAccessSummary({ labelOf }: { labelOf: (role: string) => string }) {
  const t = useTranslations('users');
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [roles, setRoles] = useState<RoleAccess[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get('/roles/access')
      .then((res) => { setModules(res.data?.modules ?? []); setRoles(res.data?.roles ?? []); })
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="text-xs text-muted-foreground">{t('roleGuide.loadFailed')}</p>;
  if (!roles) return <Skeleton className="h-20 w-full" />;

  const moduleLabel = (m: ModuleDef) =>
    !m.plugin && t.has(`permissions.modules.items.${m.key}.label`) ? t(`permissions.modules.items.${m.key}.label`) : m.label;
  const withLevel = (role: RoleAccess, level: AccessLevel) =>
    modules.filter((m) => role.access.modules[m.key] === level).map(moduleLabel).join(', ');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
      <RoleColumn name="admin" label={labelOf('admin')}>
        <li>• {t('roleGuide.admin')}</li>
      </RoleColumn>
      {roles.map((role) => {
        const edits = withLevel(role, 'edit');
        const views = withLevel(role, 'view');
        const content = role.access.content['*'] ?? [];
        const editsContent = role.access.modules.content === 'edit';
        return (
          <RoleColumn key={role.name} name={role.name} label={labelOf(role.name)}>
            {edits && <li>• {t('roleGuide.edits', { modules: edits })}</li>}
            {views && <li>• {t('roleGuide.views', { modules: views })}</li>}
            {!edits && !views && <li>• {t('roleGuide.nothing')}</li>}
            {editsContent && !content.includes('publish') && <li>• {t('roleGuide.noPublish')}</li>}
            {editsContent && !content.includes('delete') && <li>• {t('roleGuide.noDelete')}</li>}
          </RoleColumn>
        );
      })}
    </div>
  );
}

function RoleColumn({ name, label, children }: { name: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(name)}`}>
        {label}
      </span>
      <ul className="space-y-1 text-xs text-muted-foreground">{children}</ul>
    </div>
  );
}
