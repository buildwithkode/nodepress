'use client';

import { Eye } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { useAccess } from '@/lib/use-access';

/** "View only" banner for a role with view (not edit) access to a module. */
export function ReadOnlyNotice() {
  const tc = useTranslations('common');
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <Eye className="h-4 w-4 shrink-0" />
      {tc('readOnly')}
    </div>
  );
}

/**
 * For settings-style pages: with view access only, shows the banner and
 * disables every form control inside. The API refuses changes either way.
 */
export function ReadOnly({ module, children }: { module: string; children: React.ReactNode }) {
  const { canEdit } = useAccess();
  if (canEdit(module)) return <>{children}</>;
  return (
    <div className="space-y-4">
      <ReadOnlyNotice />
      <fieldset disabled className="m-0 min-w-0 border-0 p-0">{children}</fieldset>
    </div>
  );
}
