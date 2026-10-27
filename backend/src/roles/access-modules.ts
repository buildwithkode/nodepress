import { BaseRole } from './roles.constants';

/**
 * Module access: for each role, which parts of the admin it can use —
 * `none` (hidden, API refuses), `view` (read-only) or `edit`. Admin always has
 * `edit` everywhere. Routes declare what they need with @Access(module, level).
 *
 * `content` is special: it isn't stored in role_access but derived from the
 * role's content permission rows (Permission, '*' row) — see AccessService.
 */
export const ACCESS_LEVELS = ['none', 'view', 'edit'] as const;
export type AccessLevel = typeof ACCESS_LEVELS[number];

export interface AccessModuleDef {
  key: string;
  label: string;
  description: string;
  /** Level each built-in base role gets when the role has no saved row. */
  defaults: Record<BaseRole, AccessLevel>;
  /** Set for modules contributed by a plugin. */
  plugin?: string;
}

const none = { editor: 'none', contributor: 'none', viewer: 'none' } as const;

/** Defaults reproduce what each built-in role could do before module access existed. */
export const CORE_MODULES: AccessModuleDef[] = [
  { key: 'content', label: 'Content', description: 'Entries of every content type',
    defaults: { editor: 'edit', contributor: 'edit', viewer: 'view' } },
  { key: 'media', label: 'Media library', description: 'Upload, organise and delete files',
    defaults: { editor: 'edit', contributor: 'view', viewer: 'view' } },
  { key: 'forms', label: 'Forms', description: 'Forms and their submissions',
    defaults: { editor: 'edit', contributor: 'none', viewer: 'none' } },
  { key: 'releases', label: 'Releases', description: 'Batches of scheduled publishing',
    defaults: { editor: 'edit', contributor: 'view', viewer: 'view' } },
  { key: 'redirects', label: 'Redirects', description: 'URL redirects',
    defaults: { editor: 'edit', contributor: 'none', viewer: 'none' } },
  { key: 'content_model', label: 'Content model', description: 'Content types, components, choice lists and templates',
    defaults: { editor: 'view', contributor: 'view', viewer: 'view' } },
  { key: 'languages', label: 'Languages', description: 'Content languages', defaults: none },
  { key: 'users', label: 'Users', description: 'Invite people and change their roles', defaults: none },
  { key: 'api_keys', label: 'API keys', description: 'Keys for the public API', defaults: none },
  { key: 'webhooks', label: 'Webhooks', description: 'Webhooks and their deliveries', defaults: none },
  { key: 'jobs', label: 'Jobs', description: 'Background jobs', defaults: none },
  { key: 'audit_log', label: 'Audit log', description: 'Who changed what', defaults: none },
  { key: 'plugins', label: 'Plugins', description: 'Turn plugins on and off and change their settings', defaults: none },
  { key: 'import', label: 'Import', description: 'WordPress import', defaults: none },
  { key: 'brand', label: 'Brand', description: 'Name, logo and colours', defaults: none },
  { key: 'server_settings', label: 'Server settings', description: 'Email, storage and search', defaults: none },
];

export function isAccessLevel(v: unknown): v is AccessLevel {
  return typeof v === 'string' && (ACCESS_LEVELS as readonly string[]).includes(v);
}

/** True when `have` is at least `need` (none < view < edit). */
export function levelAllows(have: AccessLevel, need: AccessLevel): boolean {
  return ACCESS_LEVELS.indexOf(have) >= ACCESS_LEVELS.indexOf(need);
}

/** The `content` module level shown for a set of content actions. */
export function contentLevel(actions: string[]): AccessLevel {
  if (actions.includes('create') || actions.includes('update')) return 'edit';
  return actions.includes('read') ? 'view' : 'none';
}

/**
 * Content actions for a level and its two extra switches. Edit never drops
 * read; view and none ignore the switches.
 */
export function contentActions(level: AccessLevel, opts: { publish?: boolean; delete?: boolean } = {}): string[] {
  if (level === 'none') return [];
  if (level === 'view') return ['read'];
  return ['create', 'read', 'update', ...(opts.delete ? ['delete'] : []), ...(opts.publish ? ['publish'] : [])];
}
