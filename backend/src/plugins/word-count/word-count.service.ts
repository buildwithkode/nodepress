import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PluginHookBus, PluginEvents, EntryLifecyclePayload, PluginRegistry } from '../../plugin/plugin-sdk';

@Injectable()
export class WordCountService implements OnModuleInit {
  private readonly logger = new Logger(WordCountService.name);

  constructor(
    private readonly hookBus: PluginHookBus,
    private readonly registry: PluginRegistry,
  ) {}

  onModuleInit() {
    this.hookBus.on(
      PluginEvents.ENTRY_BEFORE_CREATE,
      (payload: EntryLifecyclePayload) => this.processEntry(payload),
      10,
      'word-count',
      'entries:write',
    );

    this.hookBus.on(
      PluginEvents.ENTRY_BEFORE_UPDATE,
      (payload: EntryLifecyclePayload) => this.processEntry(payload),
      10,
      'word-count',
      'entries:write',
    );
  }

  private processEntry(payload: EntryLifecyclePayload): void {
    const data = payload?.data || (payload as any)?.dto?.data;
    if (!data) return;

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
