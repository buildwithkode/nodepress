'use client';

import { useCallback, useEffect, useState } from 'react';
import api from './axios';

/** A row of GET /api/roles — the four built-ins (read-only) followed by custom roles. */
export interface RoleInfo {
  name: string;
  label: string;
  description: string | null;
  /** Built-in role whose admin-area access a custom role gets (a built-in's own name). */
  baseRole: string;
  builtIn: boolean;
  userCount: number;
}

export const BUILT_IN_ROLE_NAMES = ['admin', 'editor', 'contributor', 'viewer'] as const;
/** Roles a custom role can be based on — never admin. */
export const BASE_ROLE_NAMES = ['editor', 'contributor', 'viewer'] as const;

const FALLBACK: RoleInfo[] = BUILT_IN_ROLE_NAMES.map((name) => ({
  name, label: name, description: null, baseRole: name, builtIn: true, userCount: 0,
}));

export const ROLE_BADGE_COLORS: Record<string, string> = {
  admin:       'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  editor:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  contributor: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  viewer:      'bg-muted text-muted-foreground',
  custom:      'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
};

/** Badge classes for a stored role name — every custom role shares one color. */
export function roleBadgeColor(name: string): string {
  return ROLE_BADGE_COLORS[name] ?? ROLE_BADGE_COLORS.custom;
}

/**
 * Display label for a stored role name. Built-ins are translated by the caller's
 * `common` translator; a custom role's label is data and shown as entered.
 */
export function roleLabel(
  name: string,
  roles: RoleInfo[],
  tc: { (key: string): string; has(key: string): boolean },
): string {
  if (tc.has(`roles.${name}`)) return tc(`roles.${name}`);
  return roles.find((r) => r.name === name)?.label ?? name;
}

/** Admin-only list of roles (GET /api/roles). Falls back to the built-ins while loading or on error. */
export function useRoleList() {
  const [roles, setRoles] = useState<RoleInfo[]>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<RoleInfo[]>('/roles');
      setRoles(Array.isArray(res.data) && res.data.length ? res.data : FALLBACK);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { roles, customRoles: roles.filter((r) => !r.builtIn), loading, error, reload };
}
