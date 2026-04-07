import type { PluginRegistration } from '../context/PluginContext';

/**
 * ─── Plugin Registrations ─────────────────────────────────────────────────
 *
 * This is the single place to register frontend plugins.
 * Each entry here corresponds to a plugin's PluginRegistration object, which
 * declares the nav items, dashboard widgets, and custom field types it provides.
 *
 * To install a plugin:
 *   1. Create (or install) your plugin in frontend/plugins/<plugin-name>/
 *   2. Export a PluginRegistration object from it
 *   3. Import it here and add it to PLUGIN_REGISTRATIONS
 *
 * Example:
 *   import { seoPluginRegistration } from '../plugins/seo';
 *   export const PLUGIN_REGISTRATIONS: PluginRegistration[] = [
 *     seoPluginRegistration,
 *   ];
 *
 * Plugins are initialized once when the admin layout mounts via PluginInitializer.
 */
export const PLUGIN_REGISTRATIONS: PluginRegistration[] = [
  // Add plugin registrations here
];
