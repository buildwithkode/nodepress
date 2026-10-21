import { Injectable, OnModuleInit } from '@nestjs/common';
import { PluginEvents, EntryLifecyclePayload, InjectPluginContext, PluginContext } from '../../plugin/plugin-sdk';

/**
 * Word Count & Reading Time Plugin Service
 *
 * Intercepts content entry creation and updates to calculate:
 *  - `_word_count`: Total number of words in the specified text field
 *  - `_reading_time_minutes`: Estimated reading time based on user-configured WPM
 *
 * Declares required permission: `entries:write`
 * Fully crash-isolated: If text parsing fails, it logs an error and NodePress continues uninterrupted.
 */
@Injectable()
export class WordCountService implements OnModuleInit {
  constructor(@InjectPluginContext() private readonly ctx: PluginContext) {}

  /**
   * Register lifecycle hooks on application startup.
   */
  onModuleInit() {
    // Before-hooks need `entries:write` in the manifest; the context checks that at startup.
    const handler = (payload: EntryLifecyclePayload) => this.processEntry(payload);
    this.ctx.on(PluginEvents.ENTRY_BEFORE_CREATE, handler, { priority: 10 });
    this.ctx.on(PluginEvents.ENTRY_BEFORE_UPDATE, handler, { priority: 10 });
  }

  /**
   * Reads target content, counts words, computes reading time, and attaches results to payload.data.
   */
  private processEntry(payload: EntryLifecyclePayload): void {
    const data = payload?.data;
    if (!data) return;

    // Fetch live runtime configuration managed via the Admin UI
    const config = this.ctx.config();
    const targetField = config.targetField || 'content';
    const wpm = Number(config.wordsPerMinute) || 200;

    const content = data[targetField];
    if (typeof content === 'string' && content.trim()) {
      const words = content.trim().split(/\s+/).length;
      const readingTimeMinutes = Math.max(1, Math.ceil(words / wpm));

      data._word_count = words;
      data._reading_time_minutes = readingTimeMinutes;

      this.ctx.logger.debug(
        `[word-count] Calculated ${words} words (${readingTimeMinutes} min read) for entry in "${payload.contentType || ''}"`,
      );
    }
  }
}
