import { Module } from '@nestjs/common';
import { PluginContextModule } from '../../plugin/plugin-sdk';
import { SeoAnalyzerManifest } from './manifest';
import { SeoAnalyzerService } from './seo-analyzer.service';

@Module({
  imports: [PluginContextModule.forPlugin(SeoAnalyzerManifest)],
  providers: [SeoAnalyzerService],
  exports: [SeoAnalyzerService],
})
export class SeoAnalyzerModule {}
