'use client';

import { useAuth } from '@/context/AuthContext';
import { canContent, canEdit, canView } from '@/lib/access';

/** The signed-in user's module access (see lib/access.ts). */
export function useAccess() {
  const { user } = useAuth();
  return {
    canView: (module: string) => canView(user, module),
    canEdit: (module: string) => canEdit(user, module),
    /** May the user `action` entries of `type` (any type when omitted)? */
    canContent: (action: string, type?: string | null) => canContent(user, action, type),
  };
}
