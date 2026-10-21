import { Module } from '@nestjs/common';
import { PluginContextModule } from '../../plugin/plugin-sdk';
import { WordCountManifest } from './manifest';
import { WordCountService } from './word-count.service';

/**
 * WordCountModule — NestJS module for the word-count example plugin.
 *
 * Registered automatically via plugins.config.ts when added to ENABLED_PLUGINS.
 * Add controllers here if your plugin needs to expose REST endpoints.
 */
@Module({
  imports: [PluginContextModule.forPlugin(WordCountManifest)],
  providers: [WordCountService],
  exports: [WordCountService],
})
export class WordCountModule {}
