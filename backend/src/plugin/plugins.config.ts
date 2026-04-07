import { Type } from '@nestjs/common';
import { PluginManifest } from './plugin.registry';

/**
 * ─── Plugin Configuration ─────────────────────────────────────────────────
 *
 * This is the single place to enable or disable plugins.
 * To install a plugin:
 *   1. Create (or npm install) a plugin in src/plugins/<name>/
 *   2. Import its manifest and NestJS module below
 *   3. Add it to ENABLED_PLUGINS
 *
 * The app will automatically:
 *   - Import the NestJS module (registers routes, services, event listeners)
 *   - Register the manifest in PluginRegistry (accessible via GET /api/plugins)
 *   - Expose the plugin metadata to the frontend via the /api/plugins endpoint
 *
 * ─── Example: enable the built-in Word Count plugin ───────────────────────
 *
 *   import { WordCountManifest, WordCountModule } from '../plugins/word-count';
 *   export const ENABLED_PLUGINS = [
 *     { manifest: WordCountManifest, module: WordCountModule },
 *   ];
 *
 * ─── Plugin contract ──────────────────────────────────────────────────────
 *
 * A plugin MUST export:
 *   manifest: PluginManifest  — id, name, version, description, permissions[]
 *   module: Type<any>         — a @Module() NestJS class
 *
 * A plugin MAY:
 *   - Declare @Controller() routes (they are mounted automatically)
 *   - Listen to entry lifecycle events via @OnEvent(PluginEvents.*)
 *     (requires @nestjs/event-emitter + EventEmitterModule.forRoot() in app.module.ts)
 *   - Inject PrismaService, WebhooksService, RealtimeGateway via the DI container
 *   - Register custom REST endpoints under /api/plugins/<plugin-id>/
 *
 * See src/plugin/plugin-sdk.ts for all importable types.
 * See src/plugins/word-count/ for a complete working example.
 */
export const ENABLED_PLUGINS: Array<{
  manifest: PluginManifest;
  module: Type<any>;
}> = [
  // Add plugin registrations here
];
