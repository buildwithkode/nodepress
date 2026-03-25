import { Type } from '@nestjs/common';
import { PluginManifest } from './plugin.registry';

/**
 * ─── Plugin Configuration ─────────────────────────────────────────────────
 *
 * This is the single place to enable or disable plugins.
 * To install a plugin:
 *   1. npm install the plugin package (or create one in src/plugins/)
 *   2. Import its manifest and NestJS module below
 *   3. Add it to ENABLED_PLUGINS
 *
 * Example:
 *   import { SeoPluginManifest, SeoPluginModule } from '../plugins/seo';
 *   export const ENABLED_PLUGINS = [
 *     { manifest: SeoPluginManifest, module: SeoPluginModule },
 *   ];
 *
 * The app will automatically:
 *   - Import the NestJS module (registers routes, services, event listeners)
 *   - Register the manifest in PluginRegistry (accessible via GET /api/plugins)
 *   - Expose the plugin to the frontend via the /api/plugins endpoint
 */
export const ENABLED_PLUGINS: Array<{
  manifest: PluginManifest;
  module: Type<any>;
}> = [
  // Add plugin registrations here
];
