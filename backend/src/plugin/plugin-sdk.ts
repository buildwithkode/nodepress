/**
 * NodePress Plugin SDK
 *
 * Import everything you need to build a NodePress plugin from this single entry point.
 *
 * @example
 * import { PluginManifest, PluginEvents, EntryLifecyclePayload } from 'src/plugin/plugin-sdk';
 *
 * ─── How to build a plugin ────────────────────────────────────────────────────
 *
 * 1. Create src/plugins/<your-plugin>/ with:
 *    - manifest.ts   → exports PluginManifest
 *    - *.service.ts  → @Injectable() service, use @OnEvent() to react to lifecycle events
 *    - *.module.ts   → @Module({ providers: [YourService] }) export class YourPluginModule {}
 *    - index.ts      → barrel: export { YourPluginManifest, YourPluginModule }
 *
 * 2. Register in plugins.config.ts:
 *    import { YourPluginManifest, YourPluginModule } from '../plugins/your-plugin';
 *    export const ENABLED_PLUGINS = [{ manifest: YourPluginManifest, module: YourPluginModule }];
 *
 * 3. Add npm install @nestjs/event-emitter to your backend if using @OnEvent().
 *    EventEmitterModule.forRoot() must be imported in app.module.ts.
 *
 * ─── Available lifecycle events (PluginEvents.*) ─────────────────────────────
 *    entry.beforeCreate / entry.afterCreate
 *    entry.beforeUpdate / entry.afterUpdate
 *    entry.beforeDelete / entry.afterDelete
 *    entry.beforePublish / entry.afterPublish
 */

// Plugin metadata & registry types
export type { PluginManifest, RegisteredPlugin } from './plugin.registry';

// Lifecycle event names and payload types
export { PluginEvents } from './plugin.events';
export type { PluginEventName, EntryLifecyclePayload } from './plugin.events';
