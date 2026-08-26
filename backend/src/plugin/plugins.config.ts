import { Type } from '@nestjs/common';
import { PluginManifest } from './plugin.registry';
import { WordCountManifest, WordCountModule } from '../plugins/word-count';
import { SeoAnalyzerManifest, SeoAnalyzerModule } from '../plugins/seo-analyzer';

/**
 * ─── Plugin Configuration ─────────────────────────────────────────────────
 *
 * This is the central registry of installed plugin modules.
 * Each registered plugin is automatically:
 *   - Bootstrapped by NestJS dependency injection
 *   - Synced with PostgreSQL for live UI enable/disable & settings persistence
 *   - Protected by Layer 1 capability scopes, Layer 2 crash isolation, and Layer 4 5s timeouts
 */
export const ENABLED_PLUGINS: Array<{
  manifest: PluginManifest;
  module: Type<any>;
}> = [
  { manifest: WordCountManifest, module: WordCountModule },
  { manifest: SeoAnalyzerManifest, module: SeoAnalyzerModule },
];
