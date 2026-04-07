import { Module } from '@nestjs/common';
import { WordCountService } from './word-count.service';

/**
 * WordCountModule — NestJS module for the word-count example plugin.
 *
 * Registered automatically via plugins.config.ts when added to ENABLED_PLUGINS.
 * Add controllers here if your plugin needs to expose REST endpoints.
 */
@Module({
  providers: [WordCountService],
  exports: [WordCountService],
})
export class WordCountModule {}
