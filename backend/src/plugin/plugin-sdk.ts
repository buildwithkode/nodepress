/**
 * NodePress Plugin SDK
 *
 * Import everything you need to build a NodePress plugin from this single entry point.
 *
 * @example
 * import { PluginManifest, PluginEvents, EntryLifecyclePayload, PluginHookBus } from 'src/plugin/plugin-sdk';
 */

// Plugin metadata & registry types
export type { PluginManifest, PluginConfigField, RegisteredPlugin } from './plugin.registry';
export { PluginRegistry } from './plugin.registry';

// Plugin Hook Bus & filter types
export { PluginHookBus } from './plugin-hook-bus';
export type { HookHandler, FilterHandler, RegisteredHook, RegisteredFilter } from './plugin-hook-bus';

// Lifecycle event names and payload types
export { PluginEvents } from './plugin.events';
export type { PluginEventName, EntryLifecyclePayload } from './plugin.events';
