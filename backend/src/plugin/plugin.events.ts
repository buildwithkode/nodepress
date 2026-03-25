/**
 * Entry lifecycle event names emitted by EntriesService.
 * Plugins listen to these via @OnEvent() decorators.
 *
 * Usage in a plugin service:
 *   @OnEvent(PluginEvents.ENTRY_AFTER_CREATE)
 *   handleCreate(payload: EntryLifecyclePayload) { ... }
 */
export const PluginEvents = {
  ENTRY_BEFORE_CREATE:  'entry.beforeCreate',
  ENTRY_AFTER_CREATE:   'entry.afterCreate',
  ENTRY_BEFORE_UPDATE:  'entry.beforeUpdate',
  ENTRY_AFTER_UPDATE:   'entry.afterUpdate',
  ENTRY_BEFORE_DELETE:  'entry.beforeDelete',
  ENTRY_AFTER_DELETE:   'entry.afterDelete',
  ENTRY_BEFORE_PUBLISH: 'entry.beforePublish',
  ENTRY_AFTER_PUBLISH:  'entry.afterPublish',
} as const;

export type PluginEventName = (typeof PluginEvents)[keyof typeof PluginEvents];

export interface EntryLifecyclePayload {
  id: number;
  slug: string;
  status: string;
  contentType: string;
  data?: Record<string, any>;
  /** Only present on version-restore operations */
  restoredFromVersion?: number;
}
