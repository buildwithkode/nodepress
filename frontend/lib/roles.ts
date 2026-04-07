/** Role hierarchy helpers — single source of truth for UI permission checks. */

export type UserRole = 'admin' | 'editor' | 'contributor' | 'viewer';

export const isAdmin       = (role?: string | null): boolean => role === 'admin';
export const isEditor      = (role?: string | null): boolean => role === 'editor';
export const isContributor = (role?: string | null): boolean => role === 'contributor';
export const isViewer      = (role?: string | null): boolean => role === 'viewer' || !role;

/** Admin, editor, or contributor — can create/edit content. Contributors cannot delete or publish. */
export const canManageContent = (role?: string | null): boolean =>
  role === 'admin' || role === 'editor' || role === 'contributor';

/** Admin or editor — can delete entries, media, forms; can publish/archive. */
export const canDeleteContent = (role?: string | null): boolean =>
  role === 'admin' || role === 'editor';

/** Admin or editor — can publish or archive entries. */
export const canPublishContent = (role?: string | null): boolean =>
  role === 'admin' || role === 'editor';

/** Only admin can manage structure/settings (content types, api keys, webhooks, users, audit). */
export const canManageSettings = (role?: string | null): boolean => role === 'admin';

/** Human-readable label for each role. */
export const ROLE_LABELS: Record<string, string> = {
  admin:       'Admin',
  editor:      'Editor',
  contributor: 'Contributor',
  viewer:      'Viewer',
};

/** Ordered list of assignable roles (for dropdowns). */
export const ALL_ROLES: UserRole[] = ['admin', 'editor', 'contributor', 'viewer'];
