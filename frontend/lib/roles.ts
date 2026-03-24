/** Role hierarchy helpers — single source of truth for UI permission checks. */

export type UserRole = 'admin' | 'editor' | 'viewer';

export const isAdmin  = (role?: string | null): boolean => role === 'admin';
export const isEditor = (role?: string | null): boolean => role === 'editor';
export const isViewer = (role?: string | null): boolean => role === 'viewer' || !role;

/** Admin or editor — can create/edit/delete content (entries, forms, media). */
export const canManageContent = (role?: string | null): boolean =>
  role === 'admin' || role === 'editor';

/** Only admin can manage structure/settings (content types, api keys, webhooks, users, audit). */
export const canManageSettings = (role?: string | null): boolean => role === 'admin';
