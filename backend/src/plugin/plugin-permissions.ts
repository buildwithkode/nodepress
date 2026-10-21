import { PluginEvents } from './plugin.events';

/**
 * The permissions a plugin can declare in its manifest. They describe what the
 * plugin does (shown on the admin Plugins page) and gate what it can subscribe
 * to through its PluginContext.
 *
 * Plugins run in the NodePress process with full Node.js access, so these are
 * guardrails and transparency, not a sandbox: only install plugins you trust.
 */
export const PLUGIN_PERMISSIONS = {
  'entries:read': 'Read entries, and receive after-create/update/delete/publish events',
  'entries:write': 'Change or reject entries before they are saved (before-create/update/publish hooks)',
  'entries:delete': 'React to — and veto — entry deletion (before-delete hook)',
  'content-types:write': 'Create or change content types (e.g. provision its own)',
  'media:read': 'Read media library items',
  'settings:read': 'Read install settings',
  'settings:write': 'Change install settings',
  'jobs:run': 'Run background jobs through the job queue',
  'routes:public': 'Expose HTTP routes that need no login (e.g. webhooks, storefront)',
} as const;

export type PluginPermission = keyof typeof PLUGIN_PERMISSIONS;

/** Which permission a plugin needs to subscribe to a core event. */
export const EVENT_PERMISSIONS: Record<string, PluginPermission> = {
  [PluginEvents.ENTRY_BEFORE_CREATE]: 'entries:write',
  [PluginEvents.ENTRY_BEFORE_UPDATE]: 'entries:write',
  [PluginEvents.ENTRY_BEFORE_PUBLISH]: 'entries:write',
  [PluginEvents.ENTRY_BEFORE_DELETE]: 'entries:delete',
  [PluginEvents.ENTRY_AFTER_CREATE]: 'entries:read',
  [PluginEvents.ENTRY_AFTER_UPDATE]: 'entries:read',
  [PluginEvents.ENTRY_AFTER_PUBLISH]: 'entries:read',
  [PluginEvents.ENTRY_AFTER_DELETE]: 'entries:read',
};

export const isKnownPermission = (p: string): p is PluginPermission => p === '*' || p in PLUGIN_PERMISSIONS;
