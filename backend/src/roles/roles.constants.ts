/** The four roles every install has. Stored as plain strings in users.role. */
export const BUILT_IN_ROLES = ['admin', 'editor', 'contributor', 'viewer'] as const;
export type BuiltInRole = typeof BUILT_IN_ROLES[number];

/** Roles a custom role may inherit from — never admin. */
export const BASE_ROLES = ['editor', 'contributor', 'viewer'] as const;
export type BaseRole = typeof BASE_ROLES[number];

/** Content actions each built-in role gets when it has no Permission row. */
export const DEFAULT_PERMISSIONS: Record<BuiltInRole, string[]> = {
  admin:       ['create', 'read', 'update', 'delete', 'publish'],
  editor:      ['create', 'read', 'update', 'delete', 'publish'],
  contributor: ['create', 'read', 'update'],
  viewer:      ['read'],
};

export function isBuiltInRole(name: string): name is BuiltInRole {
  return (BUILT_IN_ROLES as readonly string[]).includes(name);
}

export function isBaseRole(name: unknown): name is BaseRole {
  return typeof name === 'string' && (BASE_ROLES as readonly string[]).includes(name);
}

/** "Content Reviewer" / "content-reviewer" → "content_reviewer". */
export function normalizeRoleName(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** What JwtStrategy puts on req.user: the base role drives @Roles(), customRole drives content permissions. */
export interface EffectiveRole {
  role: BuiltInRole;
  customRole?: string;
}
