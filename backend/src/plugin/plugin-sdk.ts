/**
 * NodePress Plugin SDK
 *
 * Import everything you need to build a NodePress plugin from this single entry point.
 *
 * @example
 * import { PluginManifest, PluginEvents, PluginContextModule, InjectPluginContext, PluginContext } from 'src/plugin/plugin-sdk';
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
export type { EntryEventSource } from './plugin.events';

// A plugin's scoped handle on the core — prefer this over injecting PluginHookBus/PluginRegistry
export { PluginContextModule, InjectPluginContext, PLUGIN_CONTEXT } from './plugin-context';
export type { PluginContext, HookOptions } from './plugin-context';

// Throw from a before-hook to reject the write (HTTP 422)
export { PluginVetoError, isPluginVeto } from './plugin-veto.error';

// Permissions a manifest can declare
export { PLUGIN_PERMISSIONS, EVENT_PERMISSIONS } from './plugin-permissions';
export type { PluginPermission } from './plugin-permissions';
