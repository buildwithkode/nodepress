import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PluginHookBus, PluginEvents, EntryLifecyclePayload, PluginRegistry } from '../../plugin/plugin-sdk';

/**
 * Word Count & Reading Time Plugin Service
 *
 * Intercepts content entry creation and updates to calculate:
 *  - `_wordCount`: Total number of words in the specified text field
 *  - `_readingTimeMinutes`: Estimated reading time based on user-configured WPM
 *
 * Declares required permission: `entries:write`
 * Fully crash-isolated: If text parsing fails, it logs an error and NodePress continues uninterrupted.
 */
@Injectable()
export class WordCountService implements OnModuleInit {
  private readonly logger = new Logger(WordCountService.name);

  constructor(
    private readonly hookBus: PluginHookBus,
    private readonly registry: PluginRegistry,
  ) {}

  /**
   * Register lifecycle hooks on application startup.
   */
  onModuleInit() {
    // Intercept entry creation before writing to database
    this.hookBus.on(
      PluginEvents.ENTRY_BEFORE_CREATE,
      (payload: EntryLifecyclePayload) => this.processEntry(payload),
      10, // Priority: 10 (runs before low-priority hooks)
      'word-count',
      'entries:write', // Capability permission requirement
    );

    // Intercept entry update before writing to database
    this.hookBus.on(
      PluginEvents.ENTRY_BEFORE_UPDATE,
      (payload: EntryLifecyclePayload) => this.processEntry(payload),
      10,
      'word-count',
      'entries:write',
    );
  }

  /**
   * Reads target content, counts words, computes reading time, and attaches results to payload.data.
   */
  private processEntry(payload: EntryLifecyclePayload): void {
    const data = payload?.data || (payload as any)?.dto?.data;
    if (!data) return;

    // Fetch live runtime configuration managed via the Admin UI
    const config = this.registry.getConfig('word-count');
    const targetField = config.targetField || 'content';
    const wpm = Number(config.wordsPerMinute) || 200;

    const content = data[targetField];
    if (typeof content === 'string' && content.trim()) {
      const words = content.trim().split(/\s+/).length;
      const readingTimeMinutes = Math.max(1, Math.ceil(words / wpm));

      data._wordCount = words;
      data._readingTimeMinutes = readingTimeMinutes;

      this.logger.log(
        `[word-count] Calculated ${words} words (${readingTimeMinutes} min read) for entry in "${payload.contentType || ''}"`,
      );
    }
  }
}
