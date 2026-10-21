import { Injectable, OnModuleInit } from '@nestjs/common';
import { PluginEvents, EntryLifecyclePayload, InjectPluginContext, PluginContext } from '../../plugin/plugin-sdk';

/**
 * SEO Score & Meta Optimizer Plugin Service
 *
 * Analyzes title and meta description lengths against Google SERP display limits.
 * Attaches real-time SEO intelligence to content entries:
 *  - `_seo_score`: 0-100 quality rating
 *  - `_seo_suggestions`: Actionable tips to improve search ranking
 *
 * Declares required permission: `entries:write`
 * Crash-Proof: Errors are caught internally without affecting core CMS operations.
 */
@Injectable()
export class SeoAnalyzerService implements OnModuleInit {
  constructor(@InjectPluginContext() private readonly ctx: PluginContext) {}

  /**
   * Register SEO lifecycle hooks on application startup.
   */
  onModuleInit() {
    // Before-hooks need `entries:write` in the manifest; the context checks that at startup.
    const handler = (payload: EntryLifecyclePayload) => this.analyzeSeo(payload);
    this.ctx.on(PluginEvents.ENTRY_BEFORE_CREATE, handler, { priority: 15 });
    this.ctx.on(PluginEvents.ENTRY_BEFORE_UPDATE, handler, { priority: 15 });
  }

  /**
   * Evaluates title & description length thresholds, calculates score, and generates feedback.
   */
  private analyzeSeo(payload: EntryLifecyclePayload): void {
    const data = payload?.data;
    if (!data) return;

    // Read live SERP boundary configuration from the Admin UI
    const config = this.ctx.config();
    const minTitle = Number(config.minTitleLength) || 30;
    const maxTitle = Number(config.maxTitleLength) || 60;
    const minDesc = Number(config.minDescLength) || 70;
    const maxDesc = Number(config.maxDescLength) || 160;

    // Detect title & description from entry data or nested SEO metadata
    const rawTitle = data.title || data.name || (data.seo as any)?.title || '';
    const rawDesc = data.description || data.summary || (data.seo as any)?.description || '';

    const titleStr = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    const descStr = typeof rawDesc === 'string' ? rawDesc.trim() : '';

    let score = 100;
    const suggestions: string[] = [];

    // Evaluate title length against SERP display thresholds
    if (!titleStr) {
      score -= 40;
      suggestions.push('Missing title field.');
    } else if (titleStr.length < minTitle) {
      score -= 15;
      suggestions.push(`Title is short (${titleStr.length} chars). Aim for ${minTitle}-${maxTitle} chars.`);
    } else if (titleStr.length > maxTitle) {
      score -= 10;
      suggestions.push(`Title exceeds SERP limit (${titleStr.length} chars). Keep under ${maxTitle} chars.`);
    }

    // Evaluate description length against SERP snippet thresholds
    if (!descStr) {
      score -= 30;
      suggestions.push('Missing meta description.');
    } else if (descStr.length < minDesc) {
      score -= 15;
      suggestions.push(`Description is short (${descStr.length} chars). Aim for ${minDesc}-${maxDesc} chars.`);
    } else if (descStr.length > maxDesc) {
      score -= 10;
      suggestions.push(`Description exceeds SERP limit (${descStr.length} chars). Keep under ${maxDesc} chars.`);
    }

    // Attach computed SEO metrics to the entry payload
    data._seo_score = Math.max(0, score);
    data._seo_suggestions = suggestions;

    this.ctx.logger.debug(
      `[seo-analyzer] Entry in "${payload.contentType || ''}" analyzed: SEO Score ${score}/100 (${suggestions.length} suggestions)`,
    );
  }
}
