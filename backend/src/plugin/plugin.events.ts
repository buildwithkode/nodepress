/**
 * Entry lifecycle events. Subscribe through your plugin's context:
 *
 *   ctx.on(PluginEvents.ENTRY_AFTER_CREATE, (payload: EntryLifecyclePayload) => { … });
 *
 * They fire from every write path — admin, public API, bulk actions, import,
 * restore, translations and the scheduler (see `source`). Before-hooks run
 * before the write: mutate `payload.data` to change what is saved (admin and
 * public API creates/updates), or throw PluginVetoError to reject it.
 * (There is no @nestjs/event-emitter — @OnEvent() handlers never fire.)
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

/** Which write path fired the event. */
export type EntryEventSource = 'admin' | 'api' | 'bulk' | 'import' | 'restore' | 'translation' | 'scheduler' | 'promote';

export interface EntryLifecyclePayload {
  /** Absent on before-create (the entry doesn't exist yet). */
  id?: number;
  slug: string;
  status: string;
  contentType: string;
  locale?: string;
  /** Entry data. On before-create/update it is the data about to be saved — mutate it to change it. */
  data?: Record<string, any>;
  source?: EntryEventSource;
  /** Only present on version-restore operations */
  restoredFromVersion?: number;
}
