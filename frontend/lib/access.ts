/**
 * Module access (Users → Permissions → Module access): what a role can use in
 * the admin — `none` (hidden), `view` (read-only) or `edit`. The backend sends
 * the signed-in user's access with GET /auth/me and enforces it on every route;
 * these helpers only shape the UI. No React here — middleware imports it.
 */

export type AccessLevel = 'none' | 'view' | 'edit';

export interface UserAccess {
  modules: Record<string, AccessLevel>;
  /** Content actions per content type name; '*' covers every type not listed. */
  content: Record<string, string[]>;
}

interface AccessUser {
  role?: string | null;
  access?: UserAccess | null;
}

/** Pages only admins open, whatever the module access. */
export const ADMIN_ONLY = 'admin';

/** Admin pages → the module they belong to. Longest prefix wins. */
const PATH_MODULES: Array<[string, string]> = [
  ['/entries', 'content'],
  ['/content-types', 'content_model'],
  ['/components', 'content_model'],
  ['/choice-lists', 'content_model'],
  ['/releases', 'releases'],
  ['/forms', 'forms'],
  ['/redirects', 'redirects'],
  ['/media', 'media'],
  ['/plugins', 'plugins'],
  ['/api-keys', 'api_keys'],
  ['/webhooks', 'webhooks'],
  ['/jobs', 'jobs'],
  ['/audit-log', 'audit_log'],
  ['/users/permissions', ADMIN_ONLY],
  ['/users/roles', ADMIN_ONLY],
  ['/users', 'users'],
  ['/brand', 'brand'],
  ['/languages', 'languages'],
  ['/server-settings', 'server_settings'],
  ['/import', 'import'],
];

/** Pages that change things — they need edit, not just view. */
const EDIT_PATTERNS = [
  /^\/entries\/new$/,
  /^\/entries\/[^/]+\/edit$/,
  /^\/content-types\/new$/,
  /^\/content-types\/[^/]+\/edit$/,
  /^\/forms\/new$/,
  /^\/forms\/[^/]+\/edit$/,
  /^\/api-keys\/new$/,
];

/** The module a path belongs to, or null for pages everyone can open (dashboard, docs). */
export function moduleForPath(pathname: string): string | null {
  let best: [string, string] | null = null;
  for (const entry of PATH_MODULES) {
    const [prefix] = entry;
    if ((pathname === prefix || pathname.startsWith(prefix + '/')) && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}

/** The level a path needs: edit for create/edit pages, otherwise view. */
export function levelForPath(pathname: string): Exclude<AccessLevel, 'none'> {
  return EDIT_PATTERNS.some((r) => r.test(pathname)) ? 'edit' : 'view';
}

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

export function levelAllows(have: AccessLevel | undefined, need: AccessLevel): boolean {
  return RANK[have ?? 'none'] >= RANK[need];
}

export function accessLevel(user: AccessUser | null | undefined, module: string): AccessLevel {
  if (!user) return 'none';
  if (user.role === 'admin') return 'edit';
  if (module === ADMIN_ONLY) return 'none';
  return user.access?.modules?.[module] ?? 'none';
}

export const canView = (user: AccessUser | null | undefined, module: string) => levelAllows(accessLevel(user, module), 'view');
export const canEdit = (user: AccessUser | null | undefined, module: string) => levelAllows(accessLevel(user, module), 'edit');

/** Whether the user may `action` (create/read/update/delete/publish) entries of `type` — or of any type when omitted. */
export function canContent(user: AccessUser | null | undefined, action: string, type?: string | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const content = user.access?.content ?? {};
  if (type) return (content[type] ?? content['*'] ?? []).includes(action);
  return Object.values(content).some((actions) => actions.includes(action));
}

// ── np_access cookie: lets middleware route by access before the page loads ──
// Format: "media.e-forms.v" (only modules with access; e = edit, v = view).

export function encodeAccessCookie(access: UserAccess | null | undefined): string {
  return Object.entries(access?.modules ?? {})
    .filter(([, level]) => level !== 'none')
    .map(([module, level]) => `${module}.${level === 'edit' ? 'e' : 'v'}`)
    .join('-');
}

export function decodeAccessCookie(raw: string): Record<string, AccessLevel> {
  const modules: Record<string, AccessLevel> = {};
  for (const part of raw.split('-')) {
    const [module, level] = part.split('.');
    if (module && (level === 'e' || level === 'v')) modules[module] = level === 'e' ? 'edit' : 'view';
  }
  return modules;
}
