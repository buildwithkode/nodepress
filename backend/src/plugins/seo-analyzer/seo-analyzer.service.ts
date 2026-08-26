import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PluginHookBus, PluginEvents, EntryLifecyclePayload, PluginRegistry } from '../../plugin/plugin-sdk';

@Injectable()
export class SeoAnalyzerService implements OnModuleInit {
  private readonly logger = new Logger(SeoAnalyzerService.name);

  constructor(
    private readonly hookBus: PluginHookBus,
    private readonly registry: PluginRegistry,
  ) {}

  onModuleInit() {
    this.hookBus.on(
      PluginEvents.ENTRY_BEFORE_CREATE,
      (payload: EntryLifecyclePayload) => this.analyzeSeo(payload),
      15,
      'seo-analyzer',
      'entries:write',
    );

    this.hookBus.on(
      PluginEvents.ENTRY_BEFORE_UPDATE,
      (payload: EntryLifecyclePayload) => this.analyzeSeo(payload),
      15,
      'seo-analyzer',
      'entries:write',
    );
  }

  private analyzeSeo(payload: EntryLifecyclePayload): void {
    const data = payload?.data || (payload as any)?.dto?.data;
    if (!data) return;

    const config = this.registry.getConfig('seo-analyzer');
    const minTitle = Number(config.minTitleLength) || 30;
    const maxTitle = Number(config.maxTitleLength) || 60;
    const minDesc = Number(config.minDescLength) || 70;
    const maxDesc = Number(config.maxDescLength) || 160;

    // Detect title & description from data or seo field
    const rawTitle = data.title || data.name || (data.seo as any)?.title || '';
    const rawDesc = data.description || data.summary || (data.seo as any)?.description || '';

    const titleStr = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    const descStr = typeof rawDesc === 'string' ? rawDesc.trim() : '';

    let score = 100;
    const suggestions: string[] = [];

    // Evaluate title length
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

    // Evaluate description length
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

    data._seoScore = Math.max(0, score);
    data._seoSuggestions = suggestions;

    this.logger.log(
      `[seo-analyzer] Entry in "${payload.contentType || ''}" analyzed: SEO Score ${score}/100 (${suggestions.length} suggestions)`,
    );
  }
}
