import { Injectable, Logger } from '@nestjs/common';
import { EntryLifecyclePayload, PluginEvents } from '../../plugin/plugin-sdk';

/**
 * WordCountService — example plugin service.
 *
 * To react to entry lifecycle events, install @nestjs/event-emitter:
 *   npm install @nestjs/event-emitter
 *
 * Then add EventEmitterModule.forRoot() to app.module.ts and uncomment
 * the @OnEvent decorators below.
 *
 * Without @nestjs/event-emitter this service is still a valid NestJS provider —
 * it just won't receive events until the event emitter is wired up.
 */
@Injectable()
export class WordCountService {
  private readonly logger = new Logger(WordCountService.name);

  /**
   * Call this method manually or wire it to an @OnEvent listener.
   *
   * Example with @nestjs/event-emitter installed:
   *
   *   import { OnEvent } from '@nestjs/event-emitter';
   *
   *   @OnEvent(PluginEvents.ENTRY_AFTER_CREATE)
   *   handleAfterCreate(payload: EntryLifecyclePayload) {
   *     this.analyze(payload);
   *   }
   *
   *   @OnEvent(PluginEvents.ENTRY_AFTER_UPDATE)
   *   handleAfterUpdate(payload: EntryLifecyclePayload) {
   *     this.analyze(payload);
   *   }
   */
  analyze(payload: EntryLifecyclePayload): void {
    if (!payload.data) return;

    const text = Object.values(payload.data)
      .filter((v) => typeof v === 'string')
      .join(' ');

    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

    this.logger.log(
      `[word-count] entry #${payload.id} (${payload.contentType}): ${wordCount} words`,
    );
  }
}

// Re-export PluginEvents so callers don't need a second import
export { PluginEvents };
